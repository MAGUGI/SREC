const write = (level, payload) => {
  const line = JSON.stringify({ level, timestamp: new Date().toISOString(), ...payload });
  if (level === 'error') console.error(line);
  else console.log(line);
};
module.exports = {
  error: (payload) => write('error', payload),
  warn: (payload) => write('warn', payload),
  info: (payload) => write('info', payload),
};
