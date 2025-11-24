# MIT License
#
# Copyright (c) 2020 Michael Lynch
#
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in all
# copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
# SOFTWARE.

#!/bin/bash

set -euo pipefail

# Combined gadget management script.
# Supports init/start/add/delete/stop/clean commands to manage keyboard/mouse defaults plus optional MSD/MIC features.

USB_DEVICE_DIR="g1"
USB_GADGET_PATH="/sys/kernel/config/usb_gadget"
USB_DEVICE_PATH="${USB_GADGET_PATH}/${USB_DEVICE_DIR}"
USB_STRINGS_DIR="strings/0x409"
USB_KEYBOARD_FUNCTION="hid.keyboard"
USB_MOUSE_ABS_FUNCTION="hid.mouse0"
USB_MOUSE_REL_FUNCTION="hid.mouse1"
USB_MSD_FUNCTION="mass_storage.0"
USB_MIC_FUNCTION="uac2.usb0"
USB_CONFIG_NAME="c.1"
USB_CONFIG_DIR="configs/${USB_CONFIG_NAME}"
USB_MSD_DIR="/mnt/msd/ventoy"
META_PATH="/var/blikvm/otg"

USB_ID_VENDOR_DEFAULT="0x1d6b"
USB_ID_PRODUCT_DEFAULT="0x0106"
USB_MANUFACTURER_DEFAULT="BliKVM"
USB_PRODUCT_DEFAULT="Multifunction USB Device"

USB_ID_VENDOR="${USB_ID_VENDOR_DEFAULT}"
USB_ID_PRODUCT="${USB_ID_PRODUCT_DEFAULT}"
USB_MANUFACTURER="${USB_MANUFACTURER_DEFAULT}"
USB_PRODUCT="${USB_PRODUCT_DEFAULT}"

WAS_BOUND=0
PARSED_FEATURES=()
MSD_AVAILABLE=0
declare -A FEATURE_LABELS=(
  ["${USB_KEYBOARD_FUNCTION}"]=keyboard
  ["${USB_MOUSE_ABS_FUNCTION}"]=mouse-abs
  ["${USB_MOUSE_REL_FUNCTION}"]=mouse-rel
  ["${USB_MSD_FUNCTION}"]=msd
  ["${USB_MIC_FUNCTION}"]=mic
)
MOUSE_MODE="dual" # dual | absolute | relative

json_escape() {
  local s="$1"
  s=${s//\\/\\\\}
  s=${s//"/\\"}
  s=${s//$'\n'/\\n}
  printf '%s' "$s"
}

write_meta() {
  local func="$1"
  local desc="$2"
  local eps="$3"
  mkdir -p "$META_PATH"
  local escaped desc_file
  escaped="$(json_escape "$desc")"
  desc_file="${META_PATH}/${func}@meta.json"
  cat >"$desc_file" <<EOF
{
  "function": "${func}",
  "description": "${escaped}",
  "endpoints": ${eps}
}
EOF
}

safe_rmdir() {
  local target="$1"
  if [ -d "$target" ]; then
    rmdir "$target" || echo "Warning: failed to remove ${target}" >&2
  fi
}

usage() {
  cat <<EOF >&2
Usage: $0 <command> [options]
Commands:
  init [msd] [mic]       Initialize gadget with default keyboard+dual-mouse and optional features.
  start [msd] [mic]      Start or resume gadget; optional args ensure features exist.
  stop                   Unbind the gadget without removing configuration.
  clean                  Remove the gadget configuration entirely.
  add <msd|mic>          Add (enable) an optional feature.
  delete <msd|mic>       Remove an optional feature.
  list                   Show currently enabled functions.
  Options (for init/start):
    mouse_mode=dual|absolute|relative  Choose mouse mode (default: dual)
EOF
  exit 1
}

require_args() {
  if [ "$#" -eq 0 ]; then
    usage
  fi
}

parse_common_options() {
  PARSED_FEATURES=()
  while [ "$#" -gt 0 ]; do
    case "$1" in
      idVendor=*|vid=*)
        USB_ID_VENDOR="${1#*=}"
        ;;
      mouse_mode=*)
        MOUSE_MODE="${1#*=}"
        if [ "${MOUSE_MODE}" != "dual" ] && [ "${MOUSE_MODE}" != "absolute" ] && [ "${MOUSE_MODE}" != "relative" ]; then
          echo "Invalid mouse_mode: ${MOUSE_MODE}. Use dual|absolute|relative" >&2
          exit 1
        fi
        ;;
      idProduct=*|pid=*)
        USB_ID_PRODUCT="${1#*=}"
        ;;
      manufacturer=*)
        USB_MANUFACTURER="${1#*=}"
        ;;
      product=*)
        USB_PRODUCT="${1#*=}"
        ;;
      *)
        PARSED_FEATURES+=("$1")
        ;;
    esac
    shift
  done
}

ensure_hex() {
  local value="$1"
  if [[ ! "$value" =~ ^0[xX] ]]; then
    echo "0x${value}"
  else
    echo "$value"
  fi
}

select_msd_file() {
  local file
  shopt -s nullglob
  for file in "${USB_MSD_DIR}"/*.img; do
    if [ -f "$file" ]; then
      echo "$file"
      shopt -u nullglob
      return
    fi
  done
  shopt -u nullglob
  echo "" # no file found
}

ensure_gadget_root() {
  modprobe libcomposite || true
  modprobe usb_f_mass_storage || true

  mkdir -p "${USB_DEVICE_PATH}"
  pushd "${USB_DEVICE_PATH}" >/dev/null

  echo "$USB_ID_VENDOR" > idVendor
  echo "$USB_ID_PRODUCT" > idProduct
  echo 0x0100 > bcdDevice
  echo 0x0200 > bcdUSB

  mkdir -p "$USB_STRINGS_DIR"
  echo "6b65796d696d6570690" > "${USB_STRINGS_DIR}/serialnumber"
  echo "$USB_MANUFACTURER" > "${USB_STRINGS_DIR}/manufacturer"
  echo "$USB_PRODUCT" > "${USB_STRINGS_DIR}/product"

  mkdir -p "$USB_CONFIG_DIR"
  echo 250 > "${USB_CONFIG_DIR}/MaxPower"

  local cfg_strings="${USB_CONFIG_DIR}/${USB_STRINGS_DIR}"
  mkdir -p "$cfg_strings"
  echo "Config 1: ECM network" > "${cfg_strings}/configuration"

  popd >/dev/null
}

ensure_keyboard() {
  local func_path="${USB_DEVICE_PATH}/functions/${USB_KEYBOARD_FUNCTION}"
  if [ ! -d "$func_path" ]; then
    mkdir -p "$func_path"
    echo 1 > "${func_path}/protocol"
    echo 1 > "${func_path}/subclass"
    echo 8 > "${func_path}/report_length"

    local D
    D=$(mktemp)
    {
      echo -ne "\x05\x01\x09\x06\xA1\x01\x05\x08\x19\x01\x29\x03\x15\x00\x25\x01\x75\x01\x95\x03\x91\x02"
      echo -ne "\x09\x4B\x95\x01\x91\x02\x95\x04\x91\x01\x05\x07\x19\xE0\x29\xE7\x95\x08\x81\x02"
      echo -ne "\x75\x08\x95\x01\x81\x01\x19\x00\x29\x91\x26\xFF\x00\x95\x06\x81\x00\xC0"
    } >>"$D"
    cp "$D" "${func_path}/report_desc"
    rm -f "$D"

    if [ -f "${func_path}/no_out_endpoint" ]; then
      echo 1 > "${func_path}/no_out_endpoint"
    fi
  fi
  write_meta "$USB_KEYBOARD_FUNCTION" "Keyboard" 1
}

ensure_mouse_abs() {
  local func_path="${USB_DEVICE_PATH}/functions/${USB_MOUSE_ABS_FUNCTION}"
  if [ ! -d "$func_path" ]; then
    mkdir -p "$func_path"
    echo 0 > "${func_path}/protocol"
    echo 0 > "${func_path}/subclass"
    echo 7 > "${func_path}/report_length"

    local D
    D=$(mktemp)
    {
      echo -ne "\x05\x01\x09\x02\xA1\x01\x05\x09\x19\x01\x29\x08\x15\x00\x25\x01\x95\x08\x75\x01\x81\x02"
      echo -ne "\x05\x01\x09\x30\x09\x31\x16\x00\x00\x26\xFF\x7F\x75\x10\x95\x02\x81\x02"
      echo -ne "\x09\x38\x15\x81\x25\x7F\x75\x08\x95\x01\x81\x06\x05\x0C\x0A\x38\x02\x15\x81\x25\x7F\x75\x08\x95\x01\x81\x06\xC0"
    } >>"$D"
    cp "$D" "${func_path}/report_desc"
    rm -f "$D"

    if [ -f "${func_path}/no_out_endpoint" ]; then
      echo 1 > "${func_path}/no_out_endpoint"
    fi
  fi
  write_meta "$USB_MOUSE_ABS_FUNCTION" "Absolute Mouse" 1
}

ensure_mouse_rel() {
  local func_path="${USB_DEVICE_PATH}/functions/${USB_MOUSE_REL_FUNCTION}"
  if [ ! -d "$func_path" ]; then
    mkdir -p "$func_path"
    echo 2 > "${func_path}/protocol"
    echo 1 > "${func_path}/subclass"
    echo 5 > "${func_path}/report_length"

    local D
    D=$(mktemp)
    {
      echo -ne "\x05\x01\x09\x02\xA1\x01\x05\x09\x19\x01\x29\x08\x15\x00\x25\x01\x95\x08\x75\x01\x81\x02"
      echo -ne "\x05\x01\x09\x30\x09\x31\x09\x38\x15\x81\x25\x7F\x75\x08\x95\x03\x81\x06"
      echo -ne "\x05\x0C\x0A\x38\x02\x15\x81\x25\x7F\x75\x08\x95\x01\x81\x06\xC0"
    } >>"$D"
    cp "$D" "${func_path}/report_desc"
    rm -f "$D"

    if [ -f "${func_path}/no_out_endpoint" ]; then
      echo 1 > "${func_path}/no_out_endpoint"
    fi
  fi
  write_meta "$USB_MOUSE_REL_FUNCTION" "Relative Mouse" 1
}

ensure_msd() {
  local func_path="${USB_DEVICE_PATH}/functions/${USB_MSD_FUNCTION}"
  mkdir -p "$func_path"
  local file
  file="$(select_msd_file)"
  if [ -z "$file" ]; then
    echo "No .img file found under ${USB_MSD_DIR}, skipping MSD attach" >&2
    MSD_AVAILABLE=0
    return
  else
    echo "$file" > "${func_path}/lun.0/file"
    echo 1 > "${func_path}/lun.0/removable"
    echo 0 > "${func_path}/lun.0/nofua"
    MSD_AVAILABLE=1
  fi
  write_meta "$USB_MSD_FUNCTION" "Mass Storage Drive" 2
}

ensure_mic() {
  local func_path="${USB_DEVICE_PATH}/functions/${USB_MIC_FUNCTION}"
  mkdir -p "$func_path"
  echo 0 > "${func_path}/c_chmask"
  echo 3 > "${func_path}/p_chmask"
  echo 48000 > "${func_path}/p_srate"
  echo 2 > "${func_path}/p_ssize"
  write_meta "$USB_MIC_FUNCTION" "Microphone" 2
}

link_function() {
  local func="$1"
  local src="${USB_DEVICE_PATH}/functions/${func}"
  local dest="${USB_DEVICE_PATH}/${USB_CONFIG_DIR}/${func}"
  if [ ! -d "${USB_DEVICE_PATH}/${USB_CONFIG_DIR}" ]; then
    mkdir -p "${USB_DEVICE_PATH}/${USB_CONFIG_DIR}"
  fi
  if [ -L "$dest" ] || [ -f "$dest" ]; then
    rm -f "$dest"
  elif [ -d "$dest" ]; then
    # clean up unexpected directories from earlier runs
    rm -rf "$dest"
  fi
  ln -s "$src" "$dest"
}

unlink_function() {
  local func="$1"
  local dest="${USB_DEVICE_PATH}/${USB_CONFIG_DIR}/${func}"
  if [ -L "$dest" ] || [ -e "$dest" ]; then
    rm -f "$dest"
  fi
}

remove_function_dir() {
  local func="$1"
  local path="${USB_DEVICE_PATH}/functions/${func}"
  if [ -d "$path" ]; then
    # configfs entries must be removed via rmdir to avoid EPERM on attributes
    rmdir "$path" || echo "Warning: failed to remove function ${func}" >&2
  fi
  rm -f "${META_PATH}/${func}@meta.json"
}

stop_if_running() {
  WAS_BOUND=0
  local udc_path="${USB_DEVICE_PATH}/UDC"
  if [ -f "$udc_path" ]; then
    local current
    current=$(cat "$udc_path")
    if [ -n "$current" ]; then
      WAS_BOUND=1
      echo "" > "$udc_path"
    fi
  fi
}

start_udc() {
  local udc_path="${USB_DEVICE_PATH}/UDC"
  local target=""
  if [ ! -d /sys/class/udc ]; then
    echo "UDC directory missing" >&2
    exit 1
  fi
  target=$(ls /sys/class/udc | head -n1)
  if [ -z "$target" ]; then
    echo "No UDC available" >&2
    exit 1
  fi
  echo "$target" > "$udc_path"
  [ -e /dev/hidg0 ] && chmod 777 /dev/hidg0 || true
  [ -e /dev/hidg1 ] && chmod 777 /dev/hidg1 || true
  [ -e /dev/hidg2 ] && chmod 777 /dev/hidg2 || true
}

ensure_defaults() {
  ensure_gadget_root
  ensure_keyboard
  # create mouse functions depending on requested mode
  if [ "$MOUSE_MODE" = "absolute" ]; then
    ensure_mouse_abs
    link_function "$USB_KEYBOARD_FUNCTION"
    link_function "$USB_MOUSE_ABS_FUNCTION"
  elif [ "$MOUSE_MODE" = "relative" ]; then
    ensure_mouse_rel
    link_function "$USB_KEYBOARD_FUNCTION"
    link_function "$USB_MOUSE_REL_FUNCTION"
  else
    # dual
    ensure_mouse_abs
    ensure_mouse_rel
    link_function "$USB_KEYBOARD_FUNCTION"
    link_function "$USB_MOUSE_ABS_FUNCTION"
    link_function "$USB_MOUSE_REL_FUNCTION"
  fi
}

enable_feature() {
  local feature="$1"
  case "$feature" in
    msd)
      ensure_msd
      if [ "$MSD_AVAILABLE" -eq 1 ]; then
        link_function "$USB_MSD_FUNCTION"
      else
        echo "MSD feature skipped: no backing image" >&2
      fi
      ;;
    mic)
      ensure_mic
      link_function "$USB_MIC_FUNCTION"
      ;;
    "")
      ;;
    *)
      echo "Unsupported feature: ${feature}" >&2
      exit 1
      ;;
  esac
}

do_init() {
  if [ -d "$USB_DEVICE_PATH" ]; then
    do_clean
  fi
  ensure_defaults
  for feature in "$@"; do
    enable_feature "$feature"
  done
  start_udc
}

do_start() {
  if [ ! -d "$USB_DEVICE_PATH" ]; then
    do_init "$@"
    return
  fi
  stop_if_running
  ensure_defaults
  for feature in "$@"; do
    enable_feature "$feature"
  done
  start_udc
}

do_stop() {
  if [ ! -d "$USB_DEVICE_PATH" ]; then
    echo "Gadget not initialized" >&2
    return
  fi
  stop_if_running
}

feature_exists() {
  local func="$1"
  [ -d "${USB_DEVICE_PATH}/functions/${func}" ]
}

assert_gadget_exists() {
  if [ ! -d "$USB_DEVICE_PATH" ]; then
    echo "Gadget not initialized, run init first" >&2
    exit 1
  fi
}

do_add() {
  assert_gadget_exists
  stop_if_running
  enable_feature "$1"
  if [ "$WAS_BOUND" -eq 1 ]; then
    start_udc
  fi
}

remove_feature() {
  local feature="$1"
  case "$feature" in
    msd)
      unlink_function "$USB_MSD_FUNCTION"
      remove_function_dir "$USB_MSD_FUNCTION"
      MSD_AVAILABLE=0
      ;;
    mic)
      unlink_function "$USB_MIC_FUNCTION"
      remove_function_dir "$USB_MIC_FUNCTION"
      ;;
    *)
      echo "Unsupported feature: ${feature}" >&2
      exit 1
      ;;
  esac
}

do_delete() {
  assert_gadget_exists
  stop_if_running
  remove_feature "$1"
  if [ "$WAS_BOUND" -eq 1 ]; then
    start_udc
  fi
}

do_list() {
  if [ ! -d "$USB_DEVICE_PATH" ]; then
    echo "Gadget not initialized"
    return 1
  fi
  local config_path="${USB_DEVICE_PATH}/${USB_CONFIG_DIR}"
  if [ ! -d "$config_path" ]; then
    echo "No configuration found"
    return 1
  fi
  local udc_path="${USB_DEVICE_PATH}/UDC"
  local udc_state="(unknown)"
  if [ -f "$udc_path" ]; then
    local bound
    bound=$(tr -d '[:space:]' <"$udc_path")
    if [ -n "$bound" ]; then
      udc_state="${bound} (bound)"
    else
      udc_state="(disabled)"
    fi
  else
    udc_state="(missing)"
  fi
  printf 'UDC: %s\n' "$udc_state"

  local -a enabled=()
  local entry func label
  shopt -s nullglob
  for entry in "$config_path"/*; do
    if [ -L "$entry" ]; then
      func=$(basename "$entry")
      label="${FEATURE_LABELS[$func]:-$func}"
      enabled+=("$label")
    fi
  done
  shopt -u nullglob

  if [ ${#enabled[@]} -eq 0 ]; then
    echo "No functions enabled"
    return 0
  fi

  local joined="${enabled[*]}"
  printf 'Enabled functions: %s\n' "$joined"
}

clean_functions() {
  local config_path
  config_path="${USB_DEVICE_PATH}/${USB_CONFIG_DIR}"
  if [ -d "$config_path" ]; then
    find "$config_path" -mindepth 1 -maxdepth 1 -type l -delete
    if [ -d "${config_path}/${USB_STRINGS_DIR}" ]; then
      safe_rmdir "${config_path}/${USB_STRINGS_DIR}"
    fi
    safe_rmdir "$config_path"
  fi

  if [ -d "${USB_DEVICE_PATH}/functions" ]; then
    shopt -s nullglob
    for func_dir in "${USB_DEVICE_PATH}/functions"/*; do
      [ -d "$func_dir" ] || continue
      safe_rmdir "$func_dir"
    done
    shopt -u nullglob
    safe_rmdir "${USB_DEVICE_PATH}/functions"
  fi

  if [ -d "${USB_DEVICE_PATH}/${USB_STRINGS_DIR}" ]; then
    safe_rmdir "${USB_DEVICE_PATH}/${USB_STRINGS_DIR}"
  fi

  safe_rmdir "${USB_DEVICE_PATH}/webusb"
  safe_rmdir "${USB_DEVICE_PATH}/os_desc"
}

clean_meta() {
  if [ -d "$META_PATH" ]; then
    rm -f "${META_PATH}"/*.json || true
  fi
}

do_clean() {
  if [ ! -d "$USB_DEVICE_PATH" ]; then
    clean_meta
    return
  fi
  stop_if_running
  clean_functions
  safe_rmdir "$USB_DEVICE_PATH"
  clean_meta
}

COMMAND="${1:-}"
if [ -z "$COMMAND" ]; then
  usage
fi
shift || true

TRACE_ENABLED="${TRACE_GADGET:-1}"
if [ "$COMMAND" = "list" ]; then
  TRACE_ENABLED=0
fi

if [ "$TRACE_ENABLED" = "1" ]; then
  set -x
fi

case "$COMMAND" in
  init)
    parse_common_options "$@"
    USB_ID_VENDOR=$(ensure_hex "$USB_ID_VENDOR")
    USB_ID_PRODUCT=$(ensure_hex "$USB_ID_PRODUCT")
    do_init "${PARSED_FEATURES[@]}"
    ;;
  start)
    parse_common_options "$@"
    USB_ID_VENDOR=$(ensure_hex "$USB_ID_VENDOR")
    USB_ID_PRODUCT=$(ensure_hex "$USB_ID_PRODUCT")
    do_start "${PARSED_FEATURES[@]}"
    ;;
  stop)
    do_stop
    ;;
  clean)
    do_clean
    ;;
  add)
    require_args "$@"
    do_add "$1"
    ;;
  delete|del|remove)
    require_args "$@"
    do_delete "$1"
    ;;
  list)
    do_list
    ;;
  *)
    usage
    ;;
 esac
