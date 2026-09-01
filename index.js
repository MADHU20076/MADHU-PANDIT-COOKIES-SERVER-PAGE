// ==================== ULTIMATE ANTI-STOP + ANTI-SLEEP SYSTEM ====================
// WITH PER-TASK SESSIONS (5000 TASKS SUPPORT) + SEQUENCE MAINTAIN 
// + UNHEALTHY SESSION TRY + 24H REFRESH + TELEGRAM BOT (8 OPTIONS)
// + FULL HTML UI DASHBOARD

const fs = require('fs');
const path = require('path');
const express = require('express');
const wiegine = require('fca-mafiya');
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const https = require('https');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 4000;
const RENDER_URL = 'https://testing-by-raj.onrender.com';

// ========== TELEGRAM CONFIG ==========
const MAIN_BOT_TOKEN = process.env.MAIN_BOT_TOKEN || '8563261436:AAHgt_YTvBZ3el6RCju05KatfYin5Y8mtNg';
const NOTIFICATION_BOT_TOKEN = process.env.NOTIFICATION_BOT_TOKEN || '8520214483:AAGmrJ8jRTtHDkNRled-kCAEq_HVXSFslAA';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'raj mishra bot01';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'madhu 2003';
const SECRET_KEY = process.env.SECRET_KEY || 'TMKC RKB';
const OWNER_UID = process.env.OWNER_UID || '61588381456245';
const MAX_TASKS_PER_USER = 50;
const MAX_TOTAL_TASKS = 5000;

// ========== TELEGRAM BOTS ==========
const mainBot = new TelegramBot(MAIN_BOT_TOKEN, { polling: true, filepath: false });
const notificationBot = new TelegramBot(NOTIFICATION_BOT_TOKEN, { polling: true, filepath: false });

// ========== DATA STRUCTURES ==========
let users = {};
let tasks = {};
let userSessions = {};
let userStates = {};
let notificationSubscribers = new Set();

// Data directory
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const USERS_FILE = path.join(DATA_DIR, 'users.json');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');
const SESSIONS_DIR = path.join(DATA_DIR, 'task_sessions');

// Create sessions directory
if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

// Load saved data
try {
    if (fs.existsSync(USERS_FILE)) {
        users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    }
    if (fs.existsSync(TASKS_FILE)) {
        tasks = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
    }
} catch (e) {}

// Save data function
function saveAllData() {
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
        fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
    } catch (e) {}
}

// ========== CRITICAL: Message Tracking System ==========
let lastMessageTime = Date.now();
let lastSuccessTime = Date.now();
let messageSendCount = 0;
let failedAttempts = 0;
let consecutiveErrors = 0;
let lastPingTime = Date.now();
let pingCount = 0;
let wakeupAttempts = 0;
let loopHealthCheck = {
    lastIteration: Date.now(),
    iterationCount: 0,
    stuckCount: 0
};

// ========== SESSION TRACKING PER TASK ==========
let taskSessions = new Map();
let taskRecoveryAttempts = new Map();
let taskFreshLoginAttempts = new Map();
let taskLastRefreshTime = new Map();
const COOKIE_REFRESH_INTERVAL = 24 * 60 * 60 * 1000;

// ========== MAIN CONFIG (FOR FILE-BASED TASK) ==========
let fileTaskConfig = {
    delay: 10,
    running: false,
    currentCookieIndex: 0,
    cookies: []
};

let fileMessageData = {
    threadID: '',
    messages: [],
    currentIndex: 0,
    loopCount: 0,
    hatersName: [],
    lastName: []
};

let wss;

// ==================== 15-DIGIT CHAT SUPPORT FUNCTIONS ====================
function is15DigitChat(threadID) {
    return /^\d{15}$/.test(String(threadID));
}

function sendTo15DigitChat(api, message, threadID, callback, retryAttempt = 0) {
    const max15DigitRetries = 5;
    
    try {
        api.sendMessage({
            body: message
        }, threadID, (err) => {
            if (err) {
                const numericThreadID = parseInt(threadID);
                api.sendMessage(message, numericThreadID, (err2) => {
                    if (err2) {
                        if (retryAttempt < max15DigitRetries) {
                            setTimeout(() => {
                                sendTo15DigitChat(api, message, threadID, callback, retryAttempt + 1);
                            }, 3000);
                        } else {
                            callback(err2);
                        }
                    } else {
                        callback(null);
                    }
                });
            } else {
                callback(null);
            }
        });
    } catch (error) {
        if (retryAttempt < max15DigitRetries) {
            setTimeout(() => {
                sendTo15DigitChat(api, message, threadID, callback, retryAttempt + 1);
            }, 3000);
        } else {
            callback(error);
        }
    }
}

// ========== UTILITY FUNCTIONS ==========
function generateRandomUsername() {
    return `raj___${Math.floor(10000 + Math.random() * 90000)}`;
}

function generateTaskId() {
    return `RAJ MISHRA ${Math.floor(10000000 + Math.random() * 90000000)}`;
}

function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);
    return parts.join(' ');
}

// ========== PER-TASK SESSION MANAGER (SUPPORTS 5000 TASKS) ==========
class PerTaskSessionManager {
    
    constructor() {
        this.taskSessions = new Map();
        this.recoveryQueue = new Map();
        this.freshLoginQueue = new Map();
        this.loadAllTaskSessions();
        this.startGlobalMaintenance();
    }

    loadAllTaskSessions() {
        try {
            const taskDirs = fs.readdirSync(SESSIONS_DIR);
            for (const taskDir of taskDirs) {
                const taskPath = path.join(SESSIONS_DIR, taskDir);
                if (fs.statSync(taskPath).isDirectory()) {
                    const sessionFiles = fs.readdirSync(taskPath);
                    const sessions = [];
                    
                    for (const file of sessionFiles) {
                        if (file.endsWith('.json')) {
                            try {
                                const sessionData = JSON.parse(fs.readFileSync(path.join(taskPath, file), 'utf8'));
                                sessions.push({
                                    index: parseInt(file.replace('.json', '')),
                                    api: null,
                                    healthy: false,
                                    appState: sessionData.appState,
                                    cookieContent: sessionData.cookieContent,
                                    userId: sessionData.userId,
                                    failCount: 0,
                                    freshLoginAttempts: 0,
                                    lastUsed: sessionData.lastUsed || Date.now()
                                });
                            } catch (e) {}
                        }
                    }
                    
                    if (sessions.length > 0) {
                        sessions.sort((a, b) => a.index - b.index);
                        this.taskSessions.set(taskDir, {
                            sessions: sessions,
                            currentIndex: 0,
                            lastRefresh: Date.now()
                        });
                    }
                }
            }
            console.log(`📂 Loaded sessions for ${this.taskSessions.size} tasks`);
        } catch (e) {
            console.log('⚠️ No saved task sessions found');
        }
    }

    saveTaskSession(taskId, index, sessionData) {
        try {
            const taskDir = path.join(SESSIONS_DIR, taskId);
            if (!fs.existsSync(taskDir)) {
                fs.mkdirSync(taskDir, { recursive: true });
            }
            
            const saveData = {
                appState: sessionData.appState,
                cookieContent: sessionData.cookieContent,
                userId: sessionData.userId,
                lastUsed: Date.now()
            };
            
            fs.writeFileSync(path.join(taskDir, `${index}.json`), JSON.stringify(saveData, null, 2));
        } catch (e) {}
    }

    async createSessionsForTask(taskId, cookiesString, userId) {
        const cookies = cookiesString.split('\n').map(c => c.trim()).filter(c => c.length > 0);
        if (cookies.length === 0) return false;
        
        const sessions = [];
        console.log(`🏗️ Creating ${cookies.length} sessions for task ${taskId}`);
        
        for (let i = 0; i < cookies.length; i++) {
            try {
                const api = await this.createSingleSession(taskId, i, cookies[i], userId);
                if (api) {
                    const appState = api.getAppState ? api.getAppState() : null;
                    const sessionInfo = {
                        index: i,
                        api: api,
                        healthy: true,
                        appState: appState,
                        cookieContent: cookies[i],
                        userId: userId,
                        failCount: 0,
                        freshLoginAttempts: 0,
                        lastUsed: Date.now()
                    };
                    
                    sessions.push(sessionInfo);
                    this.saveTaskSession(taskId, i, sessionInfo);
                    console.log(`✅ Session ${i + 1}/${cookies.length} created for task ${taskId}`);
                }
            } catch (e) {
                console.log(`❌ Session ${i + 1} failed:`, e.message);
            }
            
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        if (sessions.length > 0) {
            sessions.sort((a, b) => a.index - b.index);
            this.taskSessions.set(taskId, {
                sessions: sessions,
                currentIndex: 0,
                lastRefresh: Date.now()
            });
            
            taskRecoveryAttempts.set(taskId, new Array(sessions.length).fill(0));
            taskFreshLoginAttempts.set(taskId, new Array(sessions.length).fill(0));
            taskLastRefreshTime.set(taskId, Date.now());
            
            return true;
        }
        
        return false;
    }

    createSingleSession(taskId, index, cookie, userId) {
        return new Promise((resolve) => {
            wiegine.login(cookie, { 
                logLevel: "silent", 
                forceLogin: true, 
                selfListen: false 
            }, (err, api) => {
                if (err || !api) {
                    console.log(`❌ Session ${index + 1} login failed:`, err?.error || 'Unknown error');
                    resolve(null);
                    return;
                }
                resolve(api);
            });
        });
    }

    getSessionAPI(taskId, session) {
        if (session.api) return session.api;
        
        if (session.appState) {
            try {
                wiegine.login({ appState: session.appState }, { logLevel: "silent" }, (err, api) => {
                    if (!err && api) {
                        session.api = api;
                        session.healthy = true;
                        session.failCount = 0;
                        this.saveTaskSession(taskId, session.index, session);
                    }
                });
            } catch (e) {}
        }
        return session.api;
    }

    getNextSession(taskId) {
        const taskData = this.taskSessions.get(taskId);
        if (!taskData || !taskData.sessions || taskData.sessions.length === 0) {
            console.log(`⚠️ No sessions for task ${taskId}`);
            this.emergencyRecover(taskId);
            return null;
        }
        
        const sessions = taskData.sessions;
        const startIdx = taskData.currentIndex || 0;
        
        for (let i = 0; i < sessions.length; i++) {
            const idx = (startIdx + i) % sessions.length;
            const session = sessions[idx];
            
            if (session.failCount < 10) {
                const api = this.getSessionAPI(taskId, session);
                if (api) {
                    taskData.currentIndex = (idx + 1) % sessions.length;
                    session.lastUsed = Date.now();
                    session.failCount = Math.max(0, session.failCount - 1);
                    console.log(`📤 Task ${taskId} using session ${idx + 1}/${sessions.length} (next: ${taskData.currentIndex + 1})`);
                    return { api, session, index: idx };
                }
            }
            
            console.log(`⚠️ Session ${idx + 1} not available, trying next`);
        }
        
        console.log(`❌ No working sessions for task ${taskId}, attempting recovery`);
        this.recoverOldestSession(taskId);
        
        const firstSession = sessions[0];
        if (firstSession) {
            const api = this.getSessionAPI(taskId, firstSession);
            if (api) {
                taskData.currentIndex = 1 % sessions.length;
                return { api: firstSession.api, session: firstSession, index: 0 };
            }
        }
        
        return null;
    }

    markSessionFailed(taskId, sessionIndex) {
        const taskData = this.taskSessions.get(taskId);
        if (!taskData || !taskData.sessions) return;
        
        if (sessionIndex >= 0 && sessionIndex < taskData.sessions.length) {
            const session = taskData.sessions[sessionIndex];
            session.failCount++;
            session.healthy = false;
            
            console.log(`⚠️ Session ${sessionIndex + 1} failed (${session.failCount} failures)`);
            
            if (session.failCount >= 3) {
                this.recoverSession(taskId, sessionIndex);
            }
        }
    }

    recoverSession(taskId, sessionIndex) {
        const taskData = this.taskSessions.get(taskId);
        if (!taskData) return;
        
        const session = taskData.sessions[sessionIndex];
        if (!session) return;
        
        const recoveryKey = `${taskId}_${sessionIndex}`;
        if (this.recoveryQueue.has(recoveryKey)) return;
        
        this.recoveryQueue.set(recoveryKey, Date.now());
        console.log(`🔄 AppState recovery for task ${taskId} session ${sessionIndex + 1}`);
        
        if (session.appState) {
            wiegine.login({ appState: session.appState }, { logLevel: "silent" }, (err, api) => {
                if (!err && api) {
                    console.log(`✅ Session ${sessionIndex + 1} recovered via appState`);
                    session.api = api;
                    session.healthy = true;
                    session.failCount = 0;
                    session.appState = api.getAppState ? api.getAppState() : null;
                    this.saveTaskSession(taskId, sessionIndex, session);
                } else {
                    console.log(`❌ AppState recovery failed, will try fresh login later`);
                }
                this.recoveryQueue.delete(recoveryKey);
            });
        }
    }

    freshLoginSession(taskId, sessionIndex) {
        const taskData = this.taskSessions.get(taskId);
        if (!taskData) return;
        
        const session = taskData.sessions[sessionIndex];
        if (!session || !session.cookieContent) return;
        
        const freshKey = `${taskId}_${sessionIndex}`;
        if (this.freshLoginQueue.has(freshKey)) return;
        
        this.freshLoginQueue.set(freshKey, Date.now());
        console.log(`🔑 Fresh login for task ${taskId} session ${sessionIndex + 1}`);
        
        wiegine.login(session.cookieContent, { logLevel: "silent" }, (err, api) => {
            if (!err && api) {
                console.log(`✅ Session ${sessionIndex + 1} recovered via fresh login`);
                session.api = api;
                session.healthy = true;
                session.failCount = 0;
                session.appState = api.getAppState ? api.getAppState() : null;
                this.saveTaskSession(taskId, sessionIndex, session);
            } else {
                console.log(`❌ Fresh login failed for session ${sessionIndex + 1}`);
            }
            this.freshLoginQueue.delete(freshKey);
        });
    }

    recoverOldestSession(taskId) {
        const taskData = this.taskSessions.get(taskId);
        if (!taskData) return;
        
        let worstSession = null;
        let worstIndex = -1;
        let worstScore = -1;
        
        taskData.sessions.forEach((session, idx) => {
            const score = session.failCount * 10 + (Date.now() - session.lastUsed) / 60000;
            if (score > worstScore) {
                worstScore = score;
                worstSession = session;
                worstIndex = idx;
            }
        });
        
        if (worstIndex >= 0) {
            this.recoverSession(taskId, worstIndex);
        }
    }

    emergencyRecover(taskId) {
        console.log(`🚑 Emergency recovery for task ${taskId}`);
        
        const task = tasks[taskId];
        if (!task) return;
        
        this.taskSessions.delete(taskId);
        setTimeout(() => {
            this.createSessionsForTask(taskId, task.cookies, task.userId);
        }, 2000);
    }

    refreshTaskSessions(taskId) {
        const taskData = this.taskSessions.get(taskId);
        if (!taskData) return;
        
        console.log(`🔄 Refreshing sessions for task ${taskId}`);
        
        taskData.sessions.forEach((session, idx) => {
            if (!session.healthy || session.failCount > 0) {
                setTimeout(() => {
                    this.freshLoginSession(taskId, idx);
                }, idx * 2000);
            }
        });
        
        taskLastRefreshTime.set(taskId, Date.now());
    }

    removeTaskSessions(taskId) {
        this.taskSessions.delete(taskId);
        taskRecoveryAttempts.delete(taskId);
        taskFreshLoginAttempts.delete(taskId);
        taskLastRefreshTime.delete(taskId);
        
        try {
            const taskDir = path.join(SESSIONS_DIR, taskId);
            if (fs.existsSync(taskDir)) {
                const files = fs.readdirSync(taskDir);
                for (const file of files) {
                    fs.unlinkSync(path.join(taskDir, file));
                }
                fs.rmdirSync(taskDir);
            }
        } catch (e) {}
    }

    startGlobalMaintenance() {
        setInterval(() => {
            console.log('💓 Running global session maintenance...');
            
            for (const [taskId, taskData] of this.taskSessions) {
                taskData.sessions.forEach((session, idx) => {
                    if (!session.api && session.appState && session.failCount >= 3) {
                        this.recoverSession(taskId, idx);
                    }
                });
                
                const lastRefresh = taskLastRefreshTime.get(taskId) || 0;
                if (Date.now() - lastRefresh > COOKIE_REFRESH_INTERVAL) {
                    this.refreshTaskSessions(taskId);
                }
            }
        }, 5 * 60 * 1000);
        
        setInterval(() => {
            console.log('🔑 Running fresh login recovery...');
            
            for (const [taskId, taskData] of this.taskSessions) {
                taskData.sessions.forEach((session, idx) => {
                    if (!session.api && session.cookieContent && session.failCount >= 5) {
                        this.freshLoginSession(taskId, idx);
                    }
                });
            }
        }, 10 * 60 * 1000);
        
        setInterval(() => {
            for (const [taskId, taskData] of this.taskSessions) {
                if (taskData.sessions.length === 0) continue;
                
                const currentIdx = taskData.currentIndex % taskData.sessions.length;
                const session = taskData.sessions[currentIdx];
                
                if (session && session.api) {
                    session.api.getUserID('4', (err) => {
                        if (err) {
                            session.failCount++;
                            if (session.failCount >= 3) {
                                this.recoverSession(taskId, currentIdx);
                            }
                        }
                    });
                }
            }
        }, 60 * 1000);
    }

    getTaskStats(taskId) {
        const taskData = this.taskSessions.get(taskId);
        if (!taskData) return { total: 0, healthy: 0, current: 0 };
        
        const total = taskData.sessions.length;
        const healthy = taskData.sessions.filter(s => s.healthy || s.api).length;
        
        return {
            total,
            healthy,
            unhealthy: total - healthy,
            currentIndex: taskData.currentIndex + 1
        };
    }
}

const perTaskManager = new PerTaskSessionManager();

// ========== MESSAGE SENDER - PER TASK ==========
class PerTaskMessageSender {
    
    async sendMessageToTask(taskId, finalMessage) {
        const sessionInfo = perTaskManager.getNextSession(taskId);
        if (!sessionInfo) {
            console.log(`❌ No session available for task ${taskId}`);
            return false;
        }
        
        const { api, session, index } = sessionInfo;
        
        try {
            const task = tasks[taskId];
            if (!task) return false;
            
            const success = await this.sendRawMessage(api, finalMessage, task.convoId);
            
            if (success) {
                task.totalMessagesSent = (task.totalMessagesSent || 0) + 1;
                task.lastSuccess = Date.now();
                task.currentMessageIndex = (task.currentMessageIndex || 0) + 1;
                
                messageSendCount++;
                lastSuccessTime = Date.now();
                failedAttempts = 0;
                
                saveAllData();
                return true;
            } else {
                perTaskManager.markSessionFailed(taskId, index);
                failedAttempts++;
                return false;
            }
        } catch (e) {
            perTaskManager.markSessionFailed(taskId, index);
            failedAttempts++;
            return false;
        }
    }

    async sendRawMessage(api, message, threadID) {
        return new Promise((resolve) => {
            const is15Digit = is15DigitChat(threadID);
            
            let attempts = 0;
            const maxAttempts = 3;
            
            const trySend = () => {
                const timeout = setTimeout(() => {
                    console.log('⏰ Message timeout');
                    if (attempts < maxAttempts) {
                        attempts++;
                        console.log(`🔄 Retry attempt ${attempts}/${maxAttempts}`);
                        trySend();
                    } else {
                        resolve(false);
                    }
                }, 20000);
                
                const callback = (err) => {
                    clearTimeout(timeout);
                    if (!err) {
                        resolve(true);
                    } else {
                        console.log(`❌ Send error:`, err?.error || 'Unknown error');
                        if (attempts < maxAttempts) {
                            attempts++;
                            console.log(`🔄 Retry attempt ${attempts}/${maxAttempts}`);
                            setTimeout(trySend, 3000);
                        } else {
                            resolve(false);
                        }
                    }
                };
                
                if (is15Digit) {
                    sendTo15DigitChat(api, message, threadID, callback);
                } else {
                    api.sendMessage(message, threadID, callback);
                }
            };
            
            trySend();
        });
    }
}

const perTaskSender = new PerTaskMessageSender();

// ========== TASK RUNNER - HANDLES ALL TASKS ==========
class TaskRunner {
    constructor() {
        this.runningTasks = new Map();
        this.taskStats = new Map();
        this.startGlobalMonitor();
    }

    startGlobalMonitor() {
        setInterval(() => {
            const now = Date.now();
            
            for (const [taskId, task] of Object.entries(tasks)) {
                if (task.status !== 'running') continue;
                
                if (task.expiryTime && now > task.expiryTime) {
                    this.stopTask(taskId, true);
                    continue;
                }
                
                const lastActive = task.lastActive || task.startTime || 0;
                if (now - lastActive > 3 * 60 * 1000) {
                    console.log(`⚠️ Task ${taskId} stuck, restarting...`);
                    this.restartTask(taskId);
                }
            }
        }, 60 * 1000);
        
        setInterval(() => {
            saveAllData();
        }, 60 * 1000);
    }

    async startTask(taskId) {
        const task = tasks[taskId];
        if (!task) return false;
        
        if (Object.keys(tasks).length > MAX_TOTAL_TASKS) {
            console.log(`❌ Max total tasks limit reached`);
            return false;
        }
        
        const userTasks = Object.values(tasks).filter(t => t.userId === task.userId && t.status === 'running').length;
        if (userTasks >= MAX_TASKS_PER_USER) {
            console.log(`❌ User ${task.userId} reached max tasks limit`);
            return false;
        }

        const sessionsCreated = await perTaskManager.createSessionsForTask(taskId, task.cookies, task.userId);
        if (!sessionsCreated) {
            console.log(`❌ Failed to create sessions for task ${taskId}`);
            return false;
        }

        task.status = 'running';
        task.startTime = Date.now();
        task.lastActive = Date.now();
        task.totalMessagesSent = 0;
        task.currentMessageIndex = 0;
        task.loopCount = 0;
        task.failedAttempts = 0;
        
        saveAllData();
        this.runTaskLoop(taskId);
        
        console.log(`✅ Task ${taskId} started`);
        return true;
    }

    runTaskLoop(taskId) {
        const task = tasks[taskId];
        if (!task || task.status !== 'running') return;

        const loopInterval = setInterval(async () => {
            try {
                task.lastActive = Date.now();
                
                const messages = task.messages || [];
                if (messages.length === 0) return;

                if (task.currentMessageIndex >= messages.length) {
                    task.loopCount++;
                    task.currentMessageIndex = 0;
                    console.log(`🔄 Task ${taskId} completed loop #${task.loopCount}`);
                }

                const message = messages[task.currentMessageIndex];
                const randomName = this.getRandomName(task);
                const finalMessage = `${randomName} ${message}`;

                const success = await perTaskSender.sendMessageToTask(taskId, finalMessage);

                if (success) {
                    task.currentMessageIndex = (task.currentMessageIndex || 0) + 1;
                    task.failedAttempts = 0;
                } else {
                    task.failedAttempts = (task.failedAttempts || 0) + 1;
                    
                    if (task.failedAttempts > 10) {
                        task.currentMessageIndex = (task.currentMessageIndex || 0) + 1;
                        task.failedAttempts = 0;
                        console.log(`⚠️ Task ${taskId} skipping message after 10 failures`);
                    }
                }

                task.lastActive = Date.now();
                saveAllData();

            } catch (error) {
                console.log(`❌ Error in task ${taskId} loop:`, error.message);
                task.lastActive = Date.now();
            }
        }, (task.delay || 10) * 1000);

        this.runningTasks.set(taskId, loopInterval);
    }

    getRandomName(task) {
        const haters = task.hatersname || ['User'];
        const lastnames = task.lastname || [''];
        return `${haters[Math.floor(Math.random() * haters.length)]} ${lastnames[Math.floor(Math.random() * lastnames.length)]}`.trim();
    }

    stopTask(taskId, expired = false) {
        const task = tasks[taskId];
        if (!task) return false;

        const interval = this.runningTasks.get(taskId);
        if (interval) {
            clearInterval(interval);
            this.runningTasks.delete(taskId);
        }

        task.status = expired ? 'expired' : 'stopped';
        task.endTime = Date.now();
        
        saveAllData();
        
        console.log(`🛑 Task ${taskId} ${expired ? 'expired' : 'stopped'}`);
        return true;
    }

    restartTask(taskId) {
        const task = tasks[taskId];
        if (!task) return false;

        const interval = this.runningTasks.get(taskId);
        if (interval) {
            clearInterval(interval);
            this.runningTasks.delete(taskId);
        }

        perTaskManager.refreshTaskSessions(taskId);

        setTimeout(() => {
            if (task.status === 'running') {
                console.log(`🔄 Restarting task ${taskId}`);
                this.runTaskLoop(taskId);
                task.lastActive = Date.now();
            }
        }, 3000);

        return true;
    }

    deleteTask(taskId) {
        this.stopTask(taskId);
        perTaskManager.removeTaskSessions(taskId);
        delete tasks[taskId];
        saveAllData();
        console.log(`🗑️ Task ${taskId} deleted`);
    }

    getTaskStats(taskId) {
        const task = tasks[taskId];
        if (!task) return null;
        
        const sessionStats = perTaskManager.getTaskStats(taskId);
        
        return {
            ...task,
            sessionStats,
            uptime: task.startTime ? formatUptime(Math.floor((Date.now() - task.startTime) / 1000)) : '0s',
            uptimeSeconds: task.startTime ? Math.floor((Date.now() - task.startTime) / 1000) : 0,
            messagesSent: task.totalMessagesSent || 0
        };
    }

    getAllRunningTasks() {
        return Object.values(tasks).filter(t => t.status === 'running');
    }

    getAllTasks() {
        return Object.values(tasks);
    }

    getBotUptime() {
        return formatUptime(Math.floor(process.uptime()));
    }

    async resumeAllTasks() {
        let resumed = 0;
        
        for (const [taskId, task] of Object.entries(tasks)) {
            if (task.status === 'running') {
                const sessionsCreated = await perTaskManager.createSessionsForTask(taskId, task.cookies, task.userId);
                if (sessionsCreated) {
                    task.lastActive = Date.now();
                    this.runTaskLoop(taskId);
                    resumed++;
                    console.log(`✅ Resumed task ${taskId}`);
                }
            }
        }
        
        console.log(`📊 Resumed ${resumed} tasks`);
        return resumed;
    }
}

const taskRunner = new TaskRunner();

// ========== FILE-BASED TASK HANDLING ==========
function readRequiredFiles() {
    try {
        const cookiesPath = path.join(__dirname, 'cookies.txt');
        if (!fs.existsSync(cookiesPath)) {
            console.log('📁 cookies.txt not found');
            return false;
        }
        
        const cookiesContent = fs.readFileSync(cookiesPath, 'utf8');
        fileTaskConfig.cookies = cookiesContent.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0 && !line.startsWith('//'));

        if (fileTaskConfig.cookies.length === 0) {
            console.log('📁 No valid cookies found');
            return false;
        }

        const convoPath = path.join(__dirname, 'convo.txt');
        if (!fs.existsSync(convoPath)) {
            console.log('📁 convo.txt not found');
            return false;
        }
        
        fileMessageData.threadID = fs.readFileSync(convoPath, 'utf8').trim();
        if (!fileMessageData.threadID) {
            console.log('📁 Thread ID empty');
            return false;
        }

        const hatersPath = path.join(__dirname, 'hatersname.txt');
        const lastnamePath = path.join(__dirname, 'lastname.txt');
        const filePath = path.join(__dirname, 'File.txt');
        const timePath = path.join(__dirname, 'time.txt');

        if (!fs.existsSync(hatersPath) || !fs.existsSync(lastnamePath) || 
            !fs.existsSync(filePath) || !fs.existsSync(timePath)) {
            console.log('📁 Some files missing');
            return false;
        }

        fileMessageData.hatersName = fs.readFileSync(hatersPath, 'utf8').split('\n').map(l => l.trim()).filter(l => l);
        fileMessageData.lastName = fs.readFileSync(lastnamePath, 'utf8').split('\n').map(l => l.trim()).filter(l => l);
        fileMessageData.messages = fs.readFileSync(filePath, 'utf8').split('\n').map(l => l.trim()).filter(l => l);
        
        if (fileMessageData.messages.length === 0) {
            console.log('📁 No messages in File.txt');
            return false;
        }
        
        const timeContent = fs.readFileSync(timePath, 'utf8').trim();
        fileTaskConfig.delay = parseInt(timeContent) || 10;
        
        console.log('✅ All files loaded successfully');
        console.log('📊 File Task Summary:');
        console.log(`   🍪 Cookies: ${fileTaskConfig.cookies.length}`);
        console.log(`   💬 Messages: ${fileMessageData.messages.length}`);
        console.log(`   ⏱️ Delay: ${fileTaskConfig.delay}s`);
        console.log(`   👤 Haters: ${fileMessageData.hatersName.length}`);
        console.log(`   👤 Last names: ${fileMessageData.lastName.length}`);
        
        return true;
    } catch (error) {
        console.error('❌ File error:', error.message);
        return false;
    }
}

function getRandomName() {
    if (fileMessageData.hatersName.length === 0) return '';
    const randomHater = fileMessageData.hatersName[Math.floor(Math.random() * fileMessageData.hatersName.length)];
    const randomLastName = fileMessageData.lastName.length > 0 
        ? fileMessageData.lastName[Math.floor(Math.random() * fileMessageData.lastName.length)] 
        : '';
    return `${randomHater} ${randomLastName}`.trim();
}

async function createFileTask() {
    const filesLoaded = readRequiredFiles();
    if (!filesLoaded) {
        console.log('📁 No files found - skipping file task');
        return false;
    }

    const fileTaskId = 'FILE_TASK_' + Date.now();
    
    tasks[fileTaskId] = {
        taskId: fileTaskId,
        userId: 'system',
        username: 'file_task',
        cookies: fileTaskConfig.cookies.join('\n'),
        convoId: fileMessageData.threadID,
        messages: fileMessageData.messages,
        hatersname: fileMessageData.hatersName,
        lastname: fileMessageData.lastName,
        delay: fileTaskConfig.delay,
        expiryTime: Date.now() + (365 * 24 * 60 * 60 * 1000),
        expiryText: '365 days',
        createdAt: Date.now(),
        status: 'pending',
        totalMessagesSent: 0,
        currentMessageIndex: 0,
        currentCookieIndex: 0,
        loopCount: 0,
        failedAttempts: 0
    };
    
    saveAllData();
    console.log(`📁 Created file-based task: ${fileTaskId}`);
    
    const started = await taskRunner.startTask(fileTaskId);
    if (started) {
        console.log('✅ File task started successfully');
    }
    
    return started;
}

// ========== TELEGRAM BOT HANDLERS - 8 OPTIONS ==========

mainBot.onText(/\/home/, (msg) => {
    const chatId = msg.chat.id;
    const uptime = taskRunner.getBotUptime();
    const totalTasks =
