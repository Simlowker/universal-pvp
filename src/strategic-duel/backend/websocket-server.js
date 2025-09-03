"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StrategicDuelWebSocketServer = void 0;
var ws_1 = require("ws");
var events_1 = require("events");
var uuid_1 = require("uuid");
var StrategicDuelWebSocketServer = /** @class */ (function (_super) {
    __extends(StrategicDuelWebSocketServer, _super);
    function StrategicDuelWebSocketServer(port) {
        if (port === void 0) { port = 8080; }
        var _this = _super.call(this) || this;
        _this.connections = new Map();
        _this.playerConnections = new Map(); // playerId -> connectionId
        _this.matchRooms = new Map(); // matchId -> connectionIds
        _this.heartbeatInterval = null;
        _this.HEARTBEAT_INTERVAL = 30000; // 30 seconds
        _this.CONNECTION_TIMEOUT = 60000; // 60 seconds
        _this.server = new ws_1.WebSocketServer({
            port: port,
            perMessageDeflate: {
                // Enable per-message deflate for better compression
                zlibDeflateOptions: {
                    level: 3,
                    chunkSize: 128,
                },
            }
        });
        _this.initializeServer();
        _this.startHeartbeat();
        return _this;
    }
    StrategicDuelWebSocketServer.prototype.initializeServer = function () {
        var _this = this;
        this.server.on('connection', function (ws, req) {
            var connectionId = (0, uuid_1.v4)();
            var connection = {
                id: connectionId,
                websocket: ws,
                lastPing: Date.now(),
                authenticated: false,
                subscriptions: new Set()
            };
            _this.connections.set(connectionId, connection);
            // Set up WebSocket event handlers
            ws.on('message', function (data) {
                _this.handleMessage(connectionId, data);
            });
            ws.on('close', function (code, reason) {
                _this.handleDisconnection(connectionId, code, reason.toString());
            });
            ws.on('error', function (error) {
                _this.handleError(connectionId, error);
            });
            ws.on('pong', function () {
                _this.handlePong(connectionId);
            });
            // Send welcome message
            _this.sendToConnection(connectionId, {
                event: 'connected',
                data: { connectionId: connectionId },
                timestamp: Date.now()
            });
            _this.emit('clientConnected', { connectionId: connectionId, ip: req.socket.remoteAddress });
        });
    };
    StrategicDuelWebSocketServer.prototype.handleMessage = function (connectionId, data) {
        var connection = this.connections.get(connectionId);
        if (!connection)
            return;
        try {
            var message = JSON.parse(data.toString());
            var now = Date.now();
            // Validate message structure
            if (!this.validateMessage(message)) {
                this.sendError(connectionId, 'Invalid message format');
                return;
            }
            // Check if authentication is required
            if (!connection.authenticated && message.type !== 'authenticate') {
                this.sendError(connectionId, 'Authentication required');
                return;
            }
            // Update connection activity
            connection.lastPing = now;
            switch (message.type) {
                case 'authenticate':
                    this.handleAuthentication(connectionId, message);
                    break;
                case 'move':
                    this.handleGameMove(connectionId, message);
                    break;
                case 'bet':
                    this.handleBet(connectionId, message);
                    break;
                case 'fold':
                    this.handleFold(connectionId, message);
                    break;
                case 'ready':
                    this.handleReady(connectionId, message);
                    break;
                case 'chat':
                    this.handleChat(connectionId, message);
                    break;
                case 'heartbeat':
                    this.handleHeartbeat(connectionId, message);
                    break;
                default:
                    this.sendError(connectionId, "Unknown message type: ".concat(message.type));
            }
        }
        catch (error) {
            console.error('Error handling message:', error);
            this.sendError(connectionId, 'Failed to process message');
        }
    };
    StrategicDuelWebSocketServer.prototype.validateMessage = function (message) {
        return (typeof message === 'object' &&
            typeof message.type === 'string' &&
            typeof message.timestamp === 'number' &&
            message.data !== undefined);
    };
    StrategicDuelWebSocketServer.prototype.handleAuthentication = function (connectionId, message) {
        var connection = this.connections.get(connectionId);
        if (!connection)
            return;
        var _a = message.data, playerId = _a.playerId, wallet = _a.wallet, signature = _a.signature;
        // TODO: Verify signature against wallet
        // For now, we'll do basic validation
        if (!playerId || !wallet) {
            this.sendError(connectionId, 'Invalid authentication data');
            return;
        }
        // Check if player is already connected
        var existingConnectionId = this.playerConnections.get(playerId);
        if (existingConnectionId && existingConnectionId !== connectionId) {
            // Disconnect the old connection
            var oldConnection = this.connections.get(existingConnectionId);
            if (oldConnection) {
                this.sendToConnection(existingConnectionId, {
                    event: 'duplicateLogin',
                    data: { reason: 'Another session started' },
                    timestamp: Date.now()
                });
                oldConnection.websocket.close(1000, 'Duplicate login');
            }
        }
        // Update connection
        connection.playerId = playerId;
        connection.wallet = wallet;
        connection.authenticated = true;
        // Map player to connection
        this.playerConnections.set(playerId, connectionId);
        this.sendToConnection(connectionId, {
            event: 'authenticated',
            data: { playerId: playerId, status: 'success' },
            timestamp: Date.now()
        });
        this.emit('playerAuthenticated', { connectionId: connectionId, playerId: playerId, wallet: wallet });
    };
    StrategicDuelWebSocketServer.prototype.handleGameMove = function (connectionId, message) {
        var connection = this.connections.get(connectionId);
        if (!connection || !connection.playerId)
            return;
        // Validate move timing (anti-cheat)
        var processingTime = Date.now() - message.timestamp;
        if (processingTime < 10) { // Suspiciously fast
            this.emit('suspiciousActivity', {
                playerId: connection.playerId,
                type: 'fastMove',
                processingTime: processingTime,
                message: message
            });
        }
        // Broadcast to match participants
        if (message.matchId) {
            this.broadcastToMatch(message.matchId, {
                event: 'playerMove',
                data: {
                    playerId: connection.playerId,
                    move: message.data,
                    timestamp: message.timestamp
                },
                timestamp: Date.now(),
                matchId: message.matchId
            }, connectionId);
        }
        this.emit('gameMove', {
            playerId: connection.playerId,
            matchId: message.matchId,
            move: message.data,
            timestamp: message.timestamp
        });
    };
    StrategicDuelWebSocketServer.prototype.handleBet = function (connectionId, message) {
        var connection = this.connections.get(connectionId);
        if (!connection || !connection.playerId)
            return;
        var _a = message.data, amount = _a.amount, confidence = _a.confidence;
        // Validate bet amount
        if (typeof amount !== 'number' || amount <= 0) {
            this.sendError(connectionId, 'Invalid bet amount');
            return;
        }
        // Record decision time for psychological profiling
        var decisionTime = Date.now() - message.timestamp;
        this.emit('playerBet', {
            playerId: connection.playerId,
            matchId: message.matchId,
            amount: amount,
            confidence: confidence,
            decisionTime: decisionTime,
            timestamp: message.timestamp
        });
        // Broadcast to match
        if (message.matchId) {
            this.broadcastToMatch(message.matchId, {
                event: 'playerBet',
                data: {
                    playerId: connection.playerId,
                    amount: amount,
                    timestamp: message.timestamp
                },
                timestamp: Date.now(),
                matchId: message.matchId
            }, connectionId);
        }
    };
    StrategicDuelWebSocketServer.prototype.handleFold = function (connectionId, message) {
        var connection = this.connections.get(connectionId);
        if (!connection || !connection.playerId)
            return;
        var decisionTime = Date.now() - message.timestamp;
        this.emit('playerFold', {
            playerId: connection.playerId,
            matchId: message.matchId,
            decisionTime: decisionTime,
            timestamp: message.timestamp
        });
        if (message.matchId) {
            this.broadcastToMatch(message.matchId, {
                event: 'playerFold',
                data: {
                    playerId: connection.playerId,
                    timestamp: message.timestamp
                },
                timestamp: Date.now(),
                matchId: message.matchId
            }, connectionId);
        }
    };
    StrategicDuelWebSocketServer.prototype.handleReady = function (connectionId, message) {
        var connection = this.connections.get(connectionId);
        if (!connection || !connection.playerId)
            return;
        connection.matchId = message.matchId;
        // Add to match room
        if (message.matchId) {
            if (!this.matchRooms.has(message.matchId)) {
                this.matchRooms.set(message.matchId, new Set());
            }
            this.matchRooms.get(message.matchId).add(connectionId);
        }
        this.emit('playerReady', {
            playerId: connection.playerId,
            matchId: message.matchId,
            timestamp: message.timestamp
        });
    };
    StrategicDuelWebSocketServer.prototype.handleChat = function (connectionId, message) {
        var connection = this.connections.get(connectionId);
        if (!connection || !connection.playerId)
            return;
        var text = message.data.text;
        // Basic chat moderation
        if (typeof text !== 'string' || text.length > 200) {
            this.sendError(connectionId, 'Invalid chat message');
            return;
        }
        // Broadcast to match
        if (message.matchId) {
            this.broadcastToMatch(message.matchId, {
                event: 'chatMessage',
                data: {
                    playerId: connection.playerId,
                    text: text,
                    timestamp: message.timestamp
                },
                timestamp: Date.now(),
                matchId: message.matchId
            });
        }
    };
    StrategicDuelWebSocketServer.prototype.handleHeartbeat = function (connectionId, message) {
        var connection = this.connections.get(connectionId);
        if (!connection)
            return;
        connection.lastPing = Date.now();
        this.sendToConnection(connectionId, {
            event: 'heartbeat',
            data: { timestamp: Date.now() },
            timestamp: Date.now()
        });
    };
    StrategicDuelWebSocketServer.prototype.handleDisconnection = function (connectionId, code, reason) {
        var connection = this.connections.get(connectionId);
        if (!connection)
            return;
        // Remove from match room
        if (connection.matchId) {
            var matchRoom = this.matchRooms.get(connection.matchId);
            if (matchRoom) {
                matchRoom.delete(connectionId);
                if (matchRoom.size === 0) {
                    this.matchRooms.delete(connection.matchId);
                }
                else {
                    // Notify remaining players
                    this.broadcastToMatch(connection.matchId, {
                        event: 'playerDisconnected',
                        data: { playerId: connection.playerId },
                        timestamp: Date.now(),
                        matchId: connection.matchId
                    });
                }
            }
        }
        // Remove player mapping
        if (connection.playerId) {
            this.playerConnections.delete(connection.playerId);
        }
        // Remove connection
        this.connections.delete(connectionId);
        this.emit('clientDisconnected', {
            connectionId: connectionId,
            playerId: connection.playerId,
            code: code,
            reason: reason
        });
    };
    StrategicDuelWebSocketServer.prototype.handleError = function (connectionId, error) {
        console.error("WebSocket error for connection ".concat(connectionId, ":"), error);
        this.emit('connectionError', { connectionId: connectionId, error: error });
    };
    StrategicDuelWebSocketServer.prototype.handlePong = function (connectionId) {
        var connection = this.connections.get(connectionId);
        if (connection) {
            connection.lastPing = Date.now();
        }
    };
    /**
     * Send message to specific connection
     */
    StrategicDuelWebSocketServer.prototype.sendToConnection = function (connectionId, message) {
        var connection = this.connections.get(connectionId);
        if (!connection || connection.websocket.readyState !== ws_1.default.OPEN) {
            return false;
        }
        try {
            connection.websocket.send(JSON.stringify(message));
            return true;
        }
        catch (error) {
            console.error("Failed to send message to ".concat(connectionId, ":"), error);
            return false;
        }
    };
    /**
     * Send message to player by ID
     */
    StrategicDuelWebSocketServer.prototype.sendToPlayer = function (playerId, message) {
        var connectionId = this.playerConnections.get(playerId);
        return connectionId ? this.sendToConnection(connectionId, message) : false;
    };
    /**
     * Broadcast message to all connections in a match
     */
    StrategicDuelWebSocketServer.prototype.broadcastToMatch = function (matchId, message, excludeConnectionId) {
        var matchRoom = this.matchRooms.get(matchId);
        if (!matchRoom)
            return;
        for (var _i = 0, matchRoom_1 = matchRoom; _i < matchRoom_1.length; _i++) {
            var connectionId = matchRoom_1[_i];
            if (connectionId !== excludeConnectionId) {
                this.sendToConnection(connectionId, message);
            }
        }
    };
    /**
     * Broadcast to all connected clients
     */
    StrategicDuelWebSocketServer.prototype.broadcastToAll = function (message, excludeConnectionId) {
        for (var _i = 0, _a = this.connections.keys(); _i < _a.length; _i++) {
            var connectionId = _a[_i];
            if (connectionId !== excludeConnectionId) {
                this.sendToConnection(connectionId, message);
            }
        }
    };
    /**
     * Send error message to connection
     */
    StrategicDuelWebSocketServer.prototype.sendError = function (connectionId, error) {
        this.sendToConnection(connectionId, {
            event: 'error',
            data: { message: error },
            timestamp: Date.now()
        });
    };
    /**
     * Start heartbeat monitoring
     */
    StrategicDuelWebSocketServer.prototype.startHeartbeat = function () {
        var _this = this;
        this.heartbeatInterval = setInterval(function () {
            var now = Date.now();
            var staleConnections = [];
            for (var _i = 0, _a = _this.connections; _i < _a.length; _i++) {
                var _b = _a[_i], connectionId = _b[0], connection = _b[1];
                // Check if connection is stale
                if (now - connection.lastPing > _this.CONNECTION_TIMEOUT) {
                    staleConnections.push(connectionId);
                }
                else {
                    // Send ping
                    if (connection.websocket.readyState === ws_1.default.OPEN) {
                        connection.websocket.ping();
                    }
                }
            }
            // Close stale connections
            for (var _c = 0, staleConnections_1 = staleConnections; _c < staleConnections_1.length; _c++) {
                var connectionId = staleConnections_1[_c];
                var connection = _this.connections.get(connectionId);
                if (connection) {
                    connection.websocket.terminate();
                    _this.handleDisconnection(connectionId, 1001, 'Connection timeout');
                }
            }
        }, this.HEARTBEAT_INTERVAL);
    };
    /**
     * Get server statistics
     */
    StrategicDuelWebSocketServer.prototype.getStats = function () {
        return {
            totalConnections: this.connections.size,
            authenticatedConnections: Array.from(this.connections.values())
                .filter(function (conn) { return conn.authenticated; }).length,
            activeMatches: this.matchRooms.size,
            averageLatency: this.calculateAverageLatency()
        };
    };
    StrategicDuelWebSocketServer.prototype.calculateAverageLatency = function () {
        var now = Date.now();
        var latencies = Array.from(this.connections.values())
            .map(function (conn) { return now - conn.lastPing; });
        return latencies.length > 0
            ? latencies.reduce(function (a, b) { return a + b; }, 0) / latencies.length
            : 0;
    };
    /**
     * Gracefully shutdown server
     */
    StrategicDuelWebSocketServer.prototype.shutdown = function () {
        return __awaiter(this, void 0, void 0, function () {
            var closePromises;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (this.heartbeatInterval) {
                            clearInterval(this.heartbeatInterval);
                        }
                        closePromises = Array.from(this.connections.values()).map(function (connection) {
                            return new Promise(function (resolve) {
                                if (connection.websocket.readyState === ws_1.default.OPEN) {
                                    connection.websocket.close(1001, 'Server shutdown');
                                }
                                resolve();
                            });
                        });
                        return [4 /*yield*/, Promise.all(closePromises)];
                    case 1:
                        _a.sent();
                        // Close server
                        return [2 /*return*/, new Promise(function (resolve, reject) {
                                _this.server.close(function (error) {
                                    if (error)
                                        reject(error);
                                    else
                                        resolve();
                                });
                            })];
                }
            });
        });
    };
    return StrategicDuelWebSocketServer;
}(events_1.EventEmitter));
exports.StrategicDuelWebSocketServer = StrategicDuelWebSocketServer;
