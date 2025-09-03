"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.VRFResolver = void 0;
const web3_js_1 = require("@solana/web3.js");
const switchboard_v2_1 = require("@switchboard-xyz/switchboard-v2");
const events_1 = require("events");
const crypto = __importStar(require("crypto"));
class VRFResolver extends events_1.EventEmitter {
    constructor(rpcUrl, vrfAuthority, queueAccount, callbackProgram) {
        super();
        this.vrfRequests = new Map();
        this.pendingOutcomes = new Map();
        // Timing constraints for fair play
        this.MIN_RESOLUTION_DELAY = 5000; // 5 seconds minimum
        this.MAX_RESOLUTION_DELAY = 30000; // 30 seconds maximum
        this.connection = new web3_js_1.Connection(rpcUrl, 'confirmed');
        this.VRF_AUTHORITY = new web3_js_1.PublicKey(vrfAuthority);
        this.QUEUE_ACCOUNT = new web3_js_1.PublicKey(queueAccount);
        this.CALLBACK_PROGRAM = new web3_js_1.PublicKey(callbackProgram);
        this.initializeSwitchboard();
    }
    async initializeSwitchboard() {
        try {
            this.switchboardProgram = await switchboard_v2_1.SwitchboardProgram.load('mainnet-beta', this.connection, undefined, this.CALLBACK_PROGRAM);
            this.emit('vrfInitialized', {
                status: 'ready',
                authority: this.VRF_AUTHORITY.toBase58()
            });
        }
        catch (error) {
            console.error('Failed to initialize Switchboard:', error);
            this.emit('vrfError', { error: 'Failed to initialize VRF system' });
        }
    }
    /**
     * Request VRF for match outcome resolution
     */
    async requestMatchOutcome(matchId, requesterId, playerData) {
        const requestId = this.generateRequestId(matchId, 'outcome');
        const vrfRequest = {
            id: requestId,
            matchId,
            requesterId,
            requestType: 'outcome',
            params: {
                playerData,
                timestamp: Date.now()
            },
            timestamp: Date.now(),
            status: 'pending'
        };
        this.vrfRequests.set(requestId, vrfRequest);
        try {
            // Create VRF account and request randomness
            const vrfAccount = await this.createVRFAccount(requestId);
            vrfRequest.vrfAccount = vrfAccount.toBase58();
            // Submit VRF request to Switchboard
            const txId = await this.submitVRFRequest(vrfAccount, vrfRequest);
            vrfRequest.onChainTxId = txId;
            this.emit('vrfRequested', {
                requestId,
                matchId,
                vrfAccount: vrfAccount.toBase58(),
                txId
            });
            // Start monitoring for fulfillment
            this.monitorVRFRequest(requestId);
            return requestId;
        }
        catch (error) {
            console.error('Failed to request VRF:', error);
            vrfRequest.status = 'failed';
            this.emit('vrfFailed', { requestId, error: error.message });
            throw error;
        }
    }
    /**
     * Request random events during gameplay
     */
    async requestRandomEvent(matchId, eventType, probability) {
        const requestId = this.generateRequestId(matchId, 'random_event');
        const vrfRequest = {
            id: requestId,
            matchId,
            requesterId: 'system',
            requestType: 'random_event',
            params: {
                eventType,
                probability,
                timestamp: Date.now()
            },
            timestamp: Date.now(),
            status: 'pending'
        };
        this.vrfRequests.set(requestId, vrfRequest);
        try {
            const vrfAccount = await this.createVRFAccount(requestId);
            vrfRequest.vrfAccount = vrfAccount.toBase58();
            const txId = await this.submitVRFRequest(vrfAccount, vrfRequest);
            vrfRequest.onChainTxId = txId;
            this.monitorVRFRequest(requestId);
            return requestId;
        }
        catch (error) {
            console.error('Failed to request random event VRF:', error);
            vrfRequest.status = 'failed';
            throw error;
        }
    }
    /**
     * Create VRF account for randomness request
     */
    async createVRFAccount(requestId) {
        try {
            // Generate VRF account keypair
            const vrfKeypair = this.switchboardProgram.mint.generateKeypair();
            // Create VRF account instruction
            const [vrfAccount] = web3_js_1.PublicKey.findProgramAddressSync([
                Buffer.from('VrfAccountData'),
                Buffer.from(requestId),
                this.VRF_AUTHORITY.toBytes()
            ], this.switchboardProgram.programId);
            // This would typically involve creating the VRF account on-chain
            // For this implementation, we'll return the derived address
            return vrfAccount;
        }
        catch (error) {
            console.error('Failed to create VRF account:', error);
            throw error;
        }
    }
    /**
     * Submit VRF request to Switchboard
     */
    async submitVRFRequest(vrfAccount, request) {
        try {
            // Create VRF request instruction
            const requestRandomnessIx = await this.switchboardProgram.methods
                .vrfRequestRandomness({
                stateBump: 255, // This should be calculated properly
                permissionBump: 255 // This should be calculated properly
            })
                .accounts({
                authority: this.VRF_AUTHORITY,
                vrf: vrfAccount,
                oracleQueue: this.QUEUE_ACCOUNT,
                queueAuthority: this.QUEUE_ACCOUNT, // Should be queue authority
                dataBuffer: this.QUEUE_ACCOUNT, // Should be queue data buffer
                permission: vrfAccount, // Should be permission account
                escrow: vrfAccount, // Should be escrow account
                payerWallet: this.VRF_AUTHORITY, // Should be payer
                payerAuthority: this.VRF_AUTHORITY,
                recentBlockhashes: new web3_js_1.PublicKey('SysvarRecentB1ockHashes11111111111111111111'),
                programState: this.switchboardProgram.programState.publicKey,
                tokenProgram: new web3_js_1.PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
            })
                .instruction();
            const transaction = new web3_js_1.Transaction().add(requestRandomnessIx);
            // In a real implementation, you would sign and send this transaction
            const simulateResult = await this.connection.simulateTransaction(transaction);
            // For demo purposes, return a mock transaction ID
            const mockTxId = `vrf_${request.id}_${Date.now()}`;
            return mockTxId;
        }
        catch (error) {
            console.error('Failed to submit VRF request:', error);
            throw error;
        }
    }
    /**
     * Monitor VRF request for fulfillment
     */
    monitorVRFRequest(requestId) {
        const request = this.vrfRequests.get(requestId);
        if (!request)
            return;
        const startTime = Date.now();
        const checkInterval = setInterval(async () => {
            const elapsed = Date.now() - startTime;
            // Timeout check
            if (elapsed > this.MAX_RESOLUTION_DELAY) {
                clearInterval(checkInterval);
                request.status = 'failed';
                this.emit('vrfTimeout', { requestId, elapsed });
                return;
            }
            // Check if minimum delay has passed
            if (elapsed < this.MIN_RESOLUTION_DELAY) {
                return;
            }
            try {
                // In a real implementation, check VRF account for fulfillment
                // For demo, we'll simulate fulfillment after minimum delay
                if (elapsed > this.MIN_RESOLUTION_DELAY) {
                    clearInterval(checkInterval);
                    await this.fulfillVRFRequest(requestId);
                }
            }
            catch (error) {
                console.error('Error checking VRF fulfillment:', error);
            }
        }, 1000);
    }
    /**
     * Fulfill VRF request with random result
     */
    async fulfillVRFRequest(requestId) {
        const request = this.vrfRequests.get(requestId);
        if (!request || request.status !== 'pending')
            return;
        try {
            // Generate cryptographically secure random value
            // In real implementation, this would come from Switchboard VRF
            const randomBuffer = crypto.randomBytes(32);
            const randomValue = parseInt(randomBuffer.toString('hex').substring(0, 8), 16);
            let result;
            switch (request.requestType) {
                case 'outcome':
                    result = await this.resolveMatchOutcome(request, randomValue);
                    break;
                case 'random_event':
                    result = await this.resolveRandomEvent(request, randomValue);
                    break;
                case 'shuffle':
                    result = await this.resolveShuffle(request, randomValue);
                    break;
                default:
                    throw new Error('Unknown VRF request type');
            }
            request.status = 'fulfilled';
            request.result = result;
            this.emit('vrfFulfilled', {
                requestId,
                matchId: request.matchId,
                result,
                randomValue,
                timestamp: Date.now()
            });
        }
        catch (error) {
            console.error('Failed to fulfill VRF request:', error);
            request.status = 'failed';
            this.emit('vrfFailed', { requestId, error: error.message });
        }
    }
    /**
     * Resolve match outcome using VRF
     */
    async resolveMatchOutcome(request, randomValue) {
        const { playerData } = request.params;
        const { player1, player2 } = playerData;
        // Calculate weighted probabilities based on scores and confidence
        const p1TotalScore = player1.score * (1 + player1.confidence / 100);
        const p2TotalScore = player2.score * (1 + player2.confidence / 100);
        const totalScore = p1TotalScore + p2TotalScore;
        // Normalize random value to 0-1
        const normalizedRandom = (randomValue % 1000000) / 1000000;
        // Determine winner based on weighted probability
        const p1WinProbability = p1TotalScore / totalScore;
        const winner = normalizedRandom < p1WinProbability ? player1.id : player2.id;
        const loser = winner === player1.id ? player2.id : player1.id;
        // Calculate confidence in the outcome
        const scoreDifference = Math.abs(p1TotalScore - p2TotalScore);
        const maxPossibleDifference = Math.max(p1TotalScore, p2TotalScore);
        const confidence = Math.min(95, 50 + (scoreDifference / maxPossibleDifference) * 45);
        const outcome = {
            matchId: request.matchId,
            winner,
            loser,
            method: 'decision',
            confidence,
            randomSeed: randomValue,
            verificationHash: this.generateVerificationHash(request.matchId, randomValue, winner)
        };
        this.pendingOutcomes.set(request.matchId, outcome);
        return outcome;
    }
    /**
     * Resolve random event using VRF
     */
    async resolveRandomEvent(request, randomValue) {
        const { eventType, probability } = request.params;
        // Normalize random value to 0-100
        const randomPercentage = (randomValue % 100);
        const triggered = randomPercentage < probability;
        const event = {
            type: eventType,
            probability,
            triggered,
            value: triggered ? (randomValue % 1000) : undefined
        };
        return event;
    }
    /**
     * Resolve shuffle/ordering using VRF
     */
    async resolveShuffle(request, randomValue) {
        const { items } = request.params;
        const shuffled = [...items];
        // Fisher-Yates shuffle using VRF randomness
        let currentIndex = shuffled.length;
        let randomIndex;
        let seed = randomValue;
        while (currentIndex !== 0) {
            // Generate next random number from seed
            seed = (seed * 1103515245 + 12345) % (2 ** 31);
            randomIndex = seed % currentIndex;
            currentIndex--;
            // Swap elements
            [shuffled[currentIndex], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[currentIndex]];
        }
        return shuffled;
    }
    /**
     * Generate verification hash for outcome integrity
     */
    generateVerificationHash(matchId, randomSeed, winner) {
        const data = `${matchId}:${randomSeed}:${winner}:${Date.now()}`;
        return crypto.createHash('sha256').update(data).digest('hex');
    }
    /**
     * Generate unique request ID
     */
    generateRequestId(matchId, type) {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2);
        return `${type}_${matchId}_${timestamp}_${random}`;
    }
    /**
     * Verify outcome integrity
     */
    verifyOutcome(matchId, providedHash) {
        const outcome = this.pendingOutcomes.get(matchId);
        if (!outcome)
            return false;
        return outcome.verificationHash === providedHash;
    }
    /**
     * Get VRF request status
     */
    getRequestStatus(requestId) {
        return this.vrfRequests.get(requestId);
    }
    /**
     * Get match outcome
     */
    getMatchOutcome(matchId) {
        return this.pendingOutcomes.get(matchId);
    }
    /**
     * Cancel pending VRF request
     */
    cancelRequest(requestId) {
        const request = this.vrfRequests.get(requestId);
        if (!request || request.status !== 'pending') {
            return false;
        }
        request.status = 'failed';
        this.emit('vrfCancelled', { requestId });
        return true;
    }
    /**
     * Get system statistics
     */
    getVRFStats() {
        const requests = Array.from(this.vrfRequests.values());
        const total = requests.length;
        const pending = requests.filter(r => r.status === 'pending').length;
        const fulfilled = requests.filter(r => r.status === 'fulfilled').length;
        const failed = requests.filter(r => r.status === 'failed').length;
        const avgFulfillmentTime = this.calculateAverageFulfillmentTime(requests);
        return {
            totalRequests: total,
            pendingRequests: pending,
            fulfilledRequests: fulfilled,
            failedRequests: failed,
            successRate: total > 0 ? (fulfilled / total) * 100 : 0,
            averageFulfillmentTime: avgFulfillmentTime,
            activeOutcomes: this.pendingOutcomes.size
        };
    }
    /**
     * Calculate average fulfillment time
     */
    calculateAverageFulfillmentTime(requests) {
        const fulfilledRequests = requests.filter(r => r.status === 'fulfilled' && r.result);
        if (fulfilledRequests.length === 0)
            return 0;
        const totalTime = fulfilledRequests.reduce((sum, request) => {
            // Estimate fulfillment time (in real implementation, track actual times)
            return sum + this.MIN_RESOLUTION_DELAY + Math.random() * 5000;
        }, 0);
        return totalTime / fulfilledRequests.length;
    }
    /**
     * Cleanup old requests and outcomes
     */
    cleanup() {
        const now = Date.now();
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours
        // Clean old VRF requests
        for (const [requestId, request] of this.vrfRequests.entries()) {
            if (now - request.timestamp > maxAge) {
                this.vrfRequests.delete(requestId);
            }
        }
        // Clean old outcomes
        for (const [matchId, outcome] of this.pendingOutcomes.entries()) {
            // Assuming outcomes have a timestamp (should be added to interface)
            this.pendingOutcomes.delete(matchId);
        }
        this.emit('cleanupComplete', {
            remainingRequests: this.vrfRequests.size,
            remainingOutcomes: this.pendingOutcomes.size
        });
    }
}
exports.VRFResolver = VRFResolver;
