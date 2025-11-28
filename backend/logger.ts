import * as winston from "winston";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, "logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

// Custom format to add file and line number
const addFileInfo = winston.format((info) => {
  const stack = new Error().stack;
  if (stack) {
    const stackLines = stack.split('\n');
    // Find the first line that's not from winston or this logger file
    const callerLine = stackLines.find(line => 
      line.includes('.ts:') && 
      !line.includes('logger.ts') &&
      !line.includes('node_modules')
    );
    
    if (callerLine) {
      // Extract file and line number
      const match = callerLine.match(/\((.+):(\d+):(\d+)\)/) || callerLine.match(/at (.+):(\d+):(\d+)/);
      if (match) {
        const fullPath = match[1];
        const fileName = path.basename(fullPath);
        const lineNumber = match[2];
        info.location = `${fileName}:${lineNumber}`;
      }
    }
  }
  return info;
});

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  addFileInfo(),
  winston.format.json()
);

// Define console format (more readable for development)
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  addFileInfo(),
  winston.format.printf((info: any) => {
    const { level, message, timestamp, location, ...meta } = info;
    const locationStr = location ? ` [${location}]` : '';
    const metaStr = Object.keys(meta).filter(k => k !== 'service').length 
      ? ` ${JSON.stringify(meta, null, 2)}` 
      : '';
    return `${timestamp} ${level}:${locationStr} ${message}${metaStr}`;
  })
);

// Create the logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: logFormat,
  defaultMeta: { service: "gameofuno-backend" },
  transports: [
    // Write all logs with level 'error' and below to error.log
    new winston.transports.File({
      filename: path.join(logsDir, "error.log"),
      level: "error",
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Write all logs with level 'info' and below to combined.log
    new winston.transports.File({
      filename: path.join(logsDir, "combined.log"),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
});

// If we're not in production, also log to the console with a simpler format
if (process.env.NODE_ENV !== "production") {
  logger.add(
    new winston.transports.Console({
      format: consoleFormat,
    })
  );
}

// Create a stream object for Morgan integration (if needed later)
(logger as any).stream = {
  write: (message: string) => {
    logger.info(message.trim());
  },
};

export default logger;
