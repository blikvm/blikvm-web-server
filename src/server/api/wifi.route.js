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
import { exec, execFile } from 'child_process';
import util from 'util';
import { createApiObj, ApiCode } from '../../common/api.js';
import { changetoRWSystem, changetoROSystem, sleep, getSystemType } from '../../common/tool.js';
import si from 'systeminformation';
import Logger from '../../log/logger.js';


const logger = new Logger();


const execAsync = util.promisify(exec);
const execFileAsync = util.promisify(execFile);

async function scanWifi(req, res, next) {
  const returnObject = createApiObj();
  try {
    const networks = await si.wifiNetworks();
    returnObject.data = { networks };
    returnObject.code = ApiCode.OK;
    res.json(returnObject);
  } catch (error) {
    returnObject.code = ApiCode.INTERNAL_SERVER_ERROR;
    returnObject.msg = error.message;
    res.json(returnObject);
  }
}

async function wifiStatus(req, res, next) {
  const returnObject = createApiObj();
  try {
    const connections = await si.wifiConnections();
    returnObject.data = {
      connections
    };
    returnObject.code = ApiCode.OK;
    res.json(returnObject);
  } catch (error) {
    returnObject.code = ApiCode.INTERNAL_SERVER_ERROR;
    returnObject.msg = error.message;
    res.json(returnObject);
  }
}

async function connectWifi(req, res, next) {
  const returnObject = createApiObj();
  let initialSystemType;
  let switchedToRW = false;
  try {
    initialSystemType = getSystemType();
    const { ssid, password } = req.body || {};

    if (initialSystemType === 'ro') {
      changetoRWSystem();
      switchedToRW = true;
    }

    if (!ssid) {
      returnObject.code = ApiCode.INVALID_INPUT_PARAM;
      returnObject.msg = 'ssid required';
      returnObject.data = { connected: false };
      return;
    }

    if (process.getuid && process.getuid() === 0) {
      await execAsync('chmod 777 -R /etc/NetworkManager/system-connections || true');
      await execAsync('systemctl restart NetworkManager');
      await sleep(1500);
    }

    const args = password
      ? ['device', 'wifi', 'connect', ssid, 'password', password]
      : ['device', 'wifi', 'connect', ssid];
    await execFileAsync('nmcli', args);

    let connections = await si.wifiConnections();
    const isConnected = Array.isArray(connections) && connections.length > 0;
    returnObject.data = { connected: isConnected, connections };
    returnObject.code = ApiCode.OK;
  } catch (error) {
    returnObject.code = ApiCode.INTERNAL_SERVER_ERROR;
    returnObject.msg = error?.message || '';
    returnObject.data = { connected: false };
  } finally {
    if (switchedToRW) {
      try { changetoROSystem(); } catch (err) {
        logger.error('Failed to restore read-only system state:', err);
      }
    }

    if (!res.headersSent) res.json(returnObject);
  }
}

async function disconnectWifi(req, res, next) {
  const returnObject = createApiObj();
  let initialSystemType;
  let switchedToRW = false;
  try {
    initialSystemType = getSystemType();
    if (initialSystemType === 'ro') {
      changetoRWSystem();
      switchedToRW = true;
    }
    let wifiConnections = await si.wifiConnections();
    let isConnected = Array.isArray(wifiConnections) && wifiConnections.length > 0;
    if (!isConnected) {
      returnObject.code = ApiCode.OK;
      returnObject.msg = 'No active Wi-Fi connection to disconnect';
      returnObject.data = { connected: false };
      return;
    }
    const { ssid } = req.body || {};
    if (ssid) {
      await execFileAsync('nmcli', ['connection', 'down', 'id', ssid]);
    } else {
      logger.info('No SSID provided, disconnecting current Wi-Fi connection');
      const cmd = "nmcli connection down id $(nmcli -t -f NAME,TYPE connection show --active | awk -F: '" + '$2=="wifi" {print $1; exit}' + "')";
      await execAsync(cmd);
      logger.info('Disconnected current Wi-Fi connection');
    }
    wifiConnections = await si.wifiConnections();
    isConnected = Array.isArray(wifiConnections) && wifiConnections.length > 0;
    returnObject.data = { connected: isConnected };
    returnObject.code = ApiCode.OK;
    returnObject.msg = `disconnected from ${ssid || 'current Wi-Fi'} `;
  } catch (error) {
    logger.error('Error disconnecting WiFi:', error);
    returnObject.code = ApiCode.INTERNAL_SERVER_ERROR;
    returnObject.msg = error.message || 'Error disconnecting WiFi';
  } finally {
    if (switchedToRW) {
      try { changetoROSystem(); } catch (err) {
        logger.error('Failed to restore read-only system state:', err);
      }
    }
    if (!res.headersSent) res.json(returnObject);
  }
}

export { scanWifi, connectWifi, disconnectWifi, wifiStatus };
