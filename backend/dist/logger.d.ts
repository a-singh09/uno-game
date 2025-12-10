import winston from 'winston';
interface LoggerStream {
    write: (message: string) => void;
}
declare const loggerWithStream: winston.Logger & {
    stream: LoggerStream;
};
export default loggerWithStream;
//# sourceMappingURL=logger.d.ts.map