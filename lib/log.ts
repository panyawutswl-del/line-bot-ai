type LogLevel = 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: string | number | boolean | undefined;
}

function emit(level: LogLevel, event: string, ctx?: LogContext) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, event, ...ctx }));
}

export const log = {
  info: (event: string, ctx?: LogContext) => emit('info', event, ctx),
  warn: (event: string, ctx?: LogContext) => emit('warn', event, ctx),
  error: (event: string, ctx?: LogContext) => emit('error', event, ctx),
};
