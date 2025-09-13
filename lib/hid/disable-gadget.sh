#!/bin/bash

# Exit on first error.
set -e

# Echo commands to stdout.
[[ "${VERBOSE:-0}" == "1" ]] && set -x || true

# Treat undefined environment variables as errors.
set -u

USB_DEVICE_DIR="g1"
LOCK_FILE="${GADGET_LOCK_FILE:-/run/usb-gadget.lock}"
FULL_CLEAN=${FULL_CLEAN:-0}
USB_GADGET_PATH="/sys/kernel/config/usb_gadget"
USB_DEVICE_PATH="${USB_GADGET_PATH}/${USB_DEVICE_DIR}"

USB_STRINGS_DIR="strings/0x409"
USB_KEYBOARD_FUNCTIONS_DIR="functions/hid.keyboard"
USB_MOUSE_FUNCTIONS_DIR="functions/hid.mouse"
USB_MASS_STORAGE_NAME="mass_storage.0"
USB_MASS_STORAGE_FUNCTIONS_DIR="functions/${USB_MASS_STORAGE_NAME}"

USB_CONFIG_INDEX=1
USB_CONFIG_DIR="configs/c.${USB_CONFIG_INDEX}"
USB_ALL_CONFIGS_DIR="configs/*"
USB_ALL_FUNCTIONS_DIR="functions/*"

# Simple logger (stderr)
log() { echo "[disable-gadget] $*" >&2; }
error_exit() { log "ERROR: $*"; exit 1; }


cd "${USB_GADGET_PATH}" || error_exit "Failed to change directory to ${USB_GADGET_PATH}"


    # Unbind any UDC first (soft disable)
if [ -d "${USB_DEVICE_PATH}" ] && [ -f "${USB_DEVICE_PATH}/UDC" ]; then
  CUR=$(cat "${USB_DEVICE_PATH}/UDC" 2>/dev/null || true)
  if [ -n "$CUR" ]; then
    log "Unbinding UDC: $CUR"
    echo "" > "${USB_DEVICE_PATH}/UDC" 2>/dev/null || log "Failed to unbind UDC"
    sleep 0.15
  fi
fi

# Iterate config directories (if any)
if ls ${USB_DEVICE_PATH}/configs 1>/dev/null 2>&1; then
  for config in "${USB_DEVICE_PATH}"/configs/*; do
    [ -d "$config" ] || continue
    # Unlink functions from this config
    for func in "${USB_DEVICE_PATH}"/functions/*; do
      [ -d "$func" ] || continue
      link="$config/$(basename "$func")"
      if [ -L "$link" ]; then
        log "Unlinking $(basename "$func") from $(basename "$config")"
        unlink "$link" || log "Failed to unlink $link"
      fi
    done
  done
fi

