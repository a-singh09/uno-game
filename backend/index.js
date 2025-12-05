const express = require("express");
const app = express();
const cors = require("cors");
const server = require("http").createServer(app);
const path = require('path');
const logger = require('./logger');
const socketConfig = require('./config/socket');
const apiRoutes = require('./routes/api');
const { initializeSocketHandlers } = require('./socket');
const { 
    startPeriodicCleanup, 
    setupGracefulShutdown, 
    setupGlobalErrorHandlers 
} = require('./utils/cleanup');
const { 
    connectRedis, 
    disconnectRedis, 
    isRedisEnabled,
    getPubClient,
    getSubClient
} = require('./config/redis');

// Set server timeout to prevent hanging connections
// Increased to 120 seconds to support long-lived WebSocket connections
server.timeout = 120000; // 120 seconds

// Initialize Socket.IO with configuration
const io = require("socket.io")(server, socketConfig);

const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());

// Track active connections
const connectionTracker = { count: 0 };

// API Routes
app.use('/api', apiRoutes);

if (process.env.NODE_ENV === "production") {
    app.use(express.static("frontend/build"));
    app.get("*", (req, res) => {
        res.sendFile(path.resolve(__dirname, "build", "index.html"));
    });
}

/**
 * Setup Redis adapter for Socket.IO (enables horizontal scaling)
 */
async function setupRedisAdapter() {
    if (!isRedisEnabled()) {
        logger.info('Redis is disabled, Socket.IO will use in-memory adapter');
        return;
    }

    try {
        // Connect Redis clients
        await connectRedis();
        
        const pubClient = getPubClient();
        const subClient = getSubClient();
        
        if (pubClient && subClient) {
            const { createAdapter } = require('@socket.io/redis-adapter');
            io.adapter(createAdapter(pubClient, subClient));
            logger.info('Socket.IO Redis adapter configured for horizontal scaling');
        }
    } catch (error) {
        logger.error('Failed to setup Redis adapter:', error.message);
        logger.warn('Falling back to in-memory adapter');
    }
}

/**
 * Initialize the server
 */
async function initializeServer() {
    // Setup Redis adapter if enabled
    await setupRedisAdapter();

    // Setup utilities
    setupGracefulShutdown(server, async () => {
        // Disconnect Redis on shutdown
        await disconnectRedis();
    });
    setupGlobalErrorHandlers();
    startPeriodicCleanup(30000, 60000); // Cleanup every 30s, remove users disconnected > 60s

    // Initialize all socket event handlers
    initializeSocketHandlers(io, connectionTracker);

    // Start server
    server.listen(PORT, () => {
        const redisStatus = isRedisEnabled() ? 'enabled' : 'disabled';
        logger.info(`Server started on Port ${PORT} at ${new Date().toISOString()} (Redis: ${redisStatus})`);
    });
}

// Start the server
initializeServer().catch(error => {
    logger.error('Failed to initialize server:', error);
    process.exit(1);
});