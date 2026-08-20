const { io } = require('socket.io-client');

const CONVERSATION_ID = Number(process.argv[2]);
const CUST_TOKEN = process.argv[3];
const OFFICER_TOKEN = process.argv[4];

function connect(name, token) {
  return new Promise((resolve, reject) => {
    const socket = io('http://localhost:3000/chat', {
      extraHeaders: { Authorization: `Bearer ${token}` },
      transports: ['websocket'],
    });
    socket.on('connect', () => {
      console.log(`[${name}] connected`, socket.id);
      resolve(socket);
    });
    socket.on('connect_error', (err) => {
      console.error(`[${name}] connect_error`, err.message);
      reject(err);
    });
    socket.on('exception', (e) => console.error(`[${name}] exception`, e));
  });
}

async function main() {
  const customer = await connect('customer', CUST_TOKEN);
  const officer = await connect('officer', OFFICER_TOKEN);

  customer.on('message', (m) => console.log('[customer] received message <<', JSON.stringify(m)));
  officer.on('message', (m) => console.log('[officer] received message <<', JSON.stringify(m)));
  customer.on('read', (m) => console.log('[customer] received read <<', JSON.stringify(m)));

  const custJoin = await customer.emitWithAck('join_conversation', { conversation_id: CONVERSATION_ID });
  console.log('[customer] join ack:', JSON.stringify(custJoin));
  const offJoin = await officer.emitWithAck('join_conversation', { conversation_id: CONVERSATION_ID });
  console.log('[officer] join ack:', JSON.stringify(offJoin));

  console.log('--- officer sends a message, spoofing role in payload (should be ignored) ---');
  const sendAck = await officer.emitWithAck('send_message', {
    conversation_id: CONVERSATION_ID,
    body: 'Hello, this is support.',
    role: 'participant', // attempted spoof — must be ignored, server derives role from the JWT
  });
  console.log('[officer] send ack:', JSON.stringify(sendAck));

  await new Promise((r) => setTimeout(r, 300));

  console.log('--- customer replies ---');
  const custSendAck = await customer.emitWithAck('send_message', {
    conversation_id: CONVERSATION_ID,
    body: 'Thanks, I have a question.',
  });
  console.log('[customer] send ack:', JSON.stringify(custSendAck));

  await new Promise((r) => setTimeout(r, 300));

  console.log('--- customer marks read ---');
  const readAck = await customer.emitWithAck('mark_read', { conversation_id: CONVERSATION_ID });
  console.log('[customer] read ack:', JSON.stringify(readAck));

  await new Promise((r) => setTimeout(r, 300));

  console.log('--- unauthenticated connection attempt (no token) ---');
  const bad = io('http://localhost:3000/chat', { transports: ['websocket'] });
  bad.on('exception', (e) => console.log('[unauth] got exception event:', JSON.stringify(e)));
  bad.on('disconnect', (reason) => console.log('[unauth] disconnected:', reason));
  await new Promise((r) => setTimeout(r, 500));

  customer.disconnect();
  officer.disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
