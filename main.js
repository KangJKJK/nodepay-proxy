import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';
import log4js from 'log4js';
import HttpsProxyAgent from 'https-proxy-agent'; // Jika Anda menggunakan proxy

const logger = log4js.getLogger();
logger.level = 'info'; // Set level logging

// Konstanta
const NP_TOKEN = "WRITE_YOUR_NP_TOKEN_HERE";
const PING_INTERVAL = 30000; // 30 detik
const RETRIES_LIMIT = 60; // Batas retry global untuk kegagalan ping

const DOMAIN_API = {
  SESSION: "https://api.nodepay.ai/api/auth/session",
  PING: "https://nw2.nodepay.ai/api/network/ping"
};

const CONNECTION_STATES = {
  CONNECTED: 1,
  DISCONNECTED: 2,
  NONE_CONNECTION: 3
};

let statusConnect = CONNECTION_STATES.NONE_CONNECTION;
let tokenInfo = NP_TOKEN;
let browserId = null;
let accountInfo = {};

// Fungsi validasi respons
function validResp(resp) {
  if (!resp || resp.code < 0) {
    throw new Error("Invalid response");
  }
  return resp;
}

// Fungsi untuk merender info profil
async function renderProfileInfo(proxy) {
  try {
    const npSessionInfo = loadSessionInfo(proxy);

    if (!npSessionInfo) {
      const response = await callApi(DOMAIN_API.SESSION, {}, proxy);
      validResp(response);
      accountInfo = response.data;
      if (accountInfo.uid) {
        saveSessionInfo(proxy, accountInfo);
        await startPing(proxy);
      } else {
        handleLogout(proxy);
      }
    } else {
      accountInfo = npSessionInfo;
      await startPing(proxy);
    }
  } catch (error) {
    logger.error(`Error in renderProfileInfo for proxy ${proxy}: ${error.message}`);
    if (error.message.includes("500 Internal Server Error")) {
      logger.info(`Removing error proxy from the list: ${proxy}`);
      removeProxyFromList(proxy);
      return null;
    } else {
      logger.error(`Connection error: ${error.message}`);
      return proxy;
    }
  }
}

// Fungsi untuk melakukan panggilan API
async function callApi(url, data, proxy) {
  const headers = {
    "Authorization": `Bearer ${tokenInfo}`,
    "Content-Type": "application/json"
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(data),
      agent: proxy ? new HttpsProxyAgent(proxy) : null
    });

    if (!response.ok) {
      throw new Error(`Failed API call to ${url}`);
    }

    const jsonResponse = await response.json();
    return validResp(jsonResponse);
  } catch (error) {
    logger.error(`Error during API call: ${error.message}`);
    throw error;
  }
}

// Fungsi untuk memulai ping
async function startPing(proxy) {
  try {
    await ping(proxy);
    setInterval(async () => {
      await ping(proxy);
    }, PING_INTERVAL);
  } catch (error) {
    logger.error(`Error in startPing for proxy ${proxy}: ${error.message}`);
  }
}

// Fungsi untuk melakukan ping
async function ping(proxy) {
  let retries = 0;

  try {
    const data = {
      id: accountInfo.uid,
      browser_id: browserId,
      timestamp: Math.floor(Date.now() / 1000)
    };

    const response = await callApi(DOMAIN_API.PING, data, proxy);
    if (response.code === 0) {
      logger.info(`Ping successful via proxy ${proxy}`);
      retries = 0;
      statusConnect = CONNECTION_STATES.CONNECTED;
    } else {
      handlePingFail(proxy, response);
    }
  } catch (error) {
    logger.error(`Ping failed via proxy ${proxy}: ${error.message}`);
    handlePingFail(proxy, null);
  }
}

// Fungsi untuk menangani kegagalan ping
function handlePingFail(proxy, response) {
  if (response && response.code === 403) {
    handleLogout(proxy);
  } else {
    statusConnect = CONNECTION_STATES.DISCONNECTED;
  }
}

// Fungsi untuk menangani logout
function handleLogout(proxy) {
  tokenInfo = null;
  statusConnect = CONNECTION_STATES.NONE_CONNECTION;
  accountInfo = {};
  saveSessionInfo(proxy, null);
  logger.info(`Logged out and cleared session info for proxy ${proxy}`);
}

// Fungsi untuk memuat session info
function loadSessionInfo(proxy) {
  // Implementasi memuat sesi
  return {};
}

// Fungsi untuk menyimpan session info
function saveSessionInfo(proxy, data) {
  // Implementasi penyimpanan sesi
}

// Fungsi untuk memvalidasi proxy
function isValidProxy(proxy) {
  // Validasi proxy
  return true;
}

// Fungsi untuk menghapus proxy dari daftar
function removeProxyFromList(proxy) {
  // Implementasi penghapusan proxy
}

// Fungsi utama
async function main() {
  const allProxies = loadProxies('proxy.txt');
  let activeProxies = allProxies.slice(0, 100).filter(isValidProxy);

  const tasks = new Map();
  for (const proxy of activeProxies) {
    tasks.set(renderProfileInfo(proxy), proxy);
  }

  while (true) {
    const [doneTask] = await Promise.race(tasks.keys());
    const failedProxy = tasks.get(doneTask);

    if ((await doneTask) === null) {
      logger.info(`Removing and replacing failed proxy: ${failedProxy}`);
      activeProxies = activeProxies.filter(p => p !== failedProxy);
      const newProxy = allProxies.shift();
      if (newProxy && isValidProxy(newProxy)) {
        activeProxies.push(newProxy);
        tasks.set(renderProfileInfo(newProxy), newProxy);
      }
    }

    tasks.delete(doneTask);

    await new Promise(resolve => setTimeout(resolve, 3000)); // Tunggu 3 detik sebelum tugas berikutnya
  }
}

// Fungsi untuk memuat proxy dari file
function loadProxies(proxyFile) {
  // Implementasi untuk memuat proxy dari file
  return [];
}

// Menangani SIGINT (Ctrl+C)
process.on('SIGINT', () => {
  logger.info("Program terminated by user.");
  process.exit();
});

main();
