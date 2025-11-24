/*****************************************************************************
#                                                                            #
#    blikvm                                                                  #
#                                                                            #
#    Copyright (C) 2021-present     blicube <info@blicube.com>               #
#                                                                            #
#    This program is free software: you can redistribute it and/or modify    #
#    it under the terms of the GNU General Public License as published by    #
#    the Free Software Foundation, either version 3 of the License, or       #
#    (at your option) any later version.                                     #
#                                                                            #
#    This program is distributed in the hope that it will be useful,         #
#    but WITHOUT ANY WARRANTY; without even the implied warranty of          #
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the           #
#    GNU General Public License for more details.                            #
#                                                                            #
#    You should have received a copy of the GNU General Public License       #
#    along with this program.  If not, see <https://www.gnu.org/licenses/>.  #
#                                                                            #
*****************************************************************************/
import fs from 'fs';
import { writeJsonAtomic } from '../../common/atomic-file.js';
import Logger from '../../log/logger.js';
import Module from '../module.js';
import { ModuleState } from '../../common/enums.js';
import { executeScriptAtPath, isDeviceFile } from '../../common/tool.js';
import { CONFIG_PATH, UTF8 } from '../../common/constants.js';

const logger = new Logger();

class HID extends Module {
  static _instance = null;
  _hidScript = null;
  _hidkeyboard = '/dev/hidg0';
  _hidmouse = '/dev/hidg1';
  _absoluteMode = true;
  _enable = false;

  constructor() {
    if (!HID._instance) {
      super();
      HID._instance = this;
      this._init();
    }
    return HID._instance;
  }

  _init() {
    const { hid } = JSON.parse(fs.readFileSync(CONFIG_PATH, UTF8));
    this._name = 'HID';
    this._hidScript = hid.hidScript;
    this._enable = hid.enable;
  }

  // mouseMode: dual relative absolute 
  // msdEnable: enable disable
  initService() {
    return new Promise((resolve, reject) => {
      if (!isDeviceFile(this._hidkeyboard) && !isDeviceFile(this._hidmouse)) {
        logger.info(this._hidScript);
        const config = JSON.parse(fs.readFileSync(CONFIG_PATH, UTF8));
        const args = [
          'init',
          `mouse_mode=${config.hid.mouseMode}`,
        ];
        if (config.msd && config.msd.enable) {
          args.push('msd');
        }
        if (config.mic && config.mic.isRegistered) {
          args.push('mic');
        }
        const identity = (config.hid && config.hid.identity) || {};
        const shellEscapeSingle = (v) => "'" + String(v).replace(/'/g, "'\\''") + "'";
        if (identity.idVendor) args.push(`idVendor=${identity.idVendor}`);
        if (identity.idProduct) args.push(`idProduct=${identity.idProduct}`);
        if (identity.manufacturer) args.push(`manufacturer=${shellEscapeSingle(identity.manufacturer)}`);
        if (identity.product) args.push(`product=${shellEscapeSingle(identity.product)}`);
        executeScriptAtPath(this._hidScript, args)
          .then( async () => {
            this._state = ModuleState.RUNNING;
            if (config.hid.enable !== true) {
              await writeJsonAtomic(CONFIG_PATH, (cfg) => { cfg.hid.enable = true; });
            }
            resolve();
          })
          .catch((err) => {
            logger.error(`${this._name} error: ${err}`);
            reject(err);
          });
      } else {
        this._state = ModuleState.RUNNING;
        logger.info(`${this._name} already running`);
        resolve();
      }
    });
  }

  startService() {
    return new Promise((resolve, reject) => {
      const args = ['start'];
      executeScriptAtPath(this._hidScript, args)
        .then( async () => {
          this._state = ModuleState.RUNNING;
          const config = JSON.parse(fs.readFileSync(CONFIG_PATH, UTF8));
          if (config.hid.enable !== true) {
            await writeJsonAtomic(CONFIG_PATH, (cfg) => { cfg.hid.enable = true; });
          }
          resolve('hid start success');
        })
        .catch((err) => {
          logger.error(`${this._name} error: ${err.message}`);
          reject(err);
        });
    });
  }

  closeService() {
    return new Promise((resolve, reject) => {
      const args = ['stop'];
      executeScriptAtPath(this._hidScript, args)
        .then( async () => {
          this._state = ModuleState.STOPPED;
          const config = JSON.parse(fs.readFileSync(CONFIG_PATH, UTF8));
          if (config.hid.enable !== false) {
            await writeJsonAtomic(CONFIG_PATH, (cfg) => { cfg.hid.enable = false; });
          }
          resolve('hid disable success');
        })
        .catch((err) => {
          logger.error(`${this._name} error: ${err.message}`);
          reject(err);
        });
    });
  }

  changeFunction(cmd, func) {
    return new Promise((resolve, reject) => {
      const args = [ cmd, func];
      executeScriptAtPath(this._hidScript, args)
        .then( async () => {
          resolve('change function success');
        })
        .catch((err) => {
          logger.error(`${this._name} error: ${err.message}`);
          reject(err);
        });
    });
  }

  getStatus() {
    const { hid } = JSON.parse(fs.readFileSync(CONFIG_PATH, UTF8));
    return {
      status: this._state,
      enable: hid.enable,
      mouseMode: hid.mouseMode,
      mouseJiggler: hid.mouseJiggler,
      jigglerInterval: hid.jigglerInterval,
      passThrough: hid.pass_through.enabled,
    };
  }
}

export default HID;
