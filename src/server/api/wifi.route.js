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
import { exec } from 'child_process';
import util from 'util';
import { createApiObj, ApiCode } from '../../common/api.js';
import { changetoRWSystem, changetoROSystem, sleep, getSystemType } from '../../common/tool.js';
import si from 'systeminformation';
import { error, log } from 'console';

const execAsync = util.promisify(exec);

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
  let rwChanged = false;
  let roRecovered = false;
  let prepPerformed = false;
  let originalState = 'error';
  try {
    const { ssid, password } = req.body || {};

    // 仅当根分区为只读时才切换为可写
    try { originalState = getSystemType(); } catch { }
    if (originalState === 'ro') {
      try { rwChanged = changetoRWSystem(); } catch { }
    }

    if (!ssid) {
      returnObject.code = ApiCode.BAD_REQUEST;
      returnObject.msg = 'ssid required';
      returnObject.data = { connected: false };
      return; // 在 finally 中统一输出
    }

    // 每次调用都做一次权限 + NM 重启（只读系统会被恢复）
    if (process.getuid && process.getuid() === 0) {
      try {
        await execAsync('chmod 777 -R /etc/NetworkManager/system-connections || true');
        await execAsync('systemctl restart NetworkManager');
        await sleep(1500); // 等待 NM 重新加载
        prepPerformed = true;
      } catch { }
    }

    const escapedSsid = ssid.replace(/"/g, '\\"');
    const escapedPwd = (password || '').replace(/"/g, '\\"');
    const cmd = password ? `nmcli device wifi connect "${escapedSsid}" password "${escapedPwd}"` : `nmcli device wifi connect "${escapedSsid}"`;
    await execAsync(cmd);
    // 连接成功后，获取当前 Wi-Fi 连接状态
    let connections = [];
    try {
      connections = await si.wifiConnections();
      console.log("wifi connections:",connections);
    } catch {}
    const isConnected = Array.isArray(connections) && connections.length > 0;
    returnObject.data = { connected: isConnected, connections };
    returnObject.code = ApiCode.OK;
  } catch (error) {
    returnObject.code = ApiCode.INTERNAL_SERVER_ERROR;
    returnObject.msg = error?.message || '';
    // 明确返回连接失败
    returnObject.data = { connected: false };
  } finally {
    // 仅当最初是只读时才恢复为只读
    if (originalState === 'ro') {
      try { roRecovered = changetoROSystem(); } catch { }
    }
    // 返回体仅包含连接是否成功
    if (!res.headersSent) res.json(returnObject);
  }
}

async function disconnectWifi(req, res, next) {
  const returnObject = createApiObj();
  let rwChanged = false;
  let roRecovered = false;
  try {
    let originalState = 'error';
    try { originalState = getSystemType(); } catch { }
    if (originalState === 'ro') {
      try { rwChanged = changetoRWSystem(); } catch { }
    }
    const { ssid } = req.body || {};
    if (ssid) {
      const escaped = ssid.replace(/"/g, '\\"');
      try { await execAsync(`nmcli connection down id "${escaped}"`); } catch { }
    } else {
      try {
        const cmd = "nmcli connection down id $(nmcli -t -f NAME,TYPE connection show --active | awk -F: '" + '$2=="wifi" {print $1; exit}' + "')";
        await execAsync(cmd);
      } catch { }
    }
    let connections = [];
    try {
      connections = await si.wifiConnections();
    } catch (error) {
      logger.error('Error fetching wifi connections after disconnect:', error);
      returnObject.code = ApiCode.INTERNAL_SERVER_ERROR;
      returnObject.msg = error.message;
      returnObject.data = { connected: false };
      return;
    }
    const isConnected = Array.isArray(connections) && connections.length > 0;
    returnObject.data = { connected: isConnected };
    returnObject.code = ApiCode.OK;
    returnObject.msg = 'disconnected';
  } catch (error) {
    returnObject.code = ApiCode.INTERNAL_SERVER_ERROR;
    returnObject.msg = error.message;
  } finally {
    // 仅当最初是只读时才恢复为只读
    try {
      const st = getSystemType();
      if (st === 'ro') {
        try { roRecovered = changetoROSystem(); } catch { }
      }
    } catch { }
    if (!res.headersSent) res.json(returnObject);
  }
}

export { scanWifi, connectWifi, disconnectWifi, wifiStatus };
