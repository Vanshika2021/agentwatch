const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json());
app.use(require('express').static('.'));
let valiron, ethers;
async function init() {
  const { ValironSDK } = await import('@valiron/sdk');
  ethers = await import('ethers');
  valiron = new ValironSDK({ apiKey: 'val_op_fe62e9f017d79f18c592bb0ee2e89e3b06f45239475e104557b8679b8afb641d', chain: 'ethereum', timeout: 8000 });
  console.log('Valiron SDK initialized');
}
const GOOD_AGENT_ID = '25459';
const BAD_AGENT_ID = '8348';
const VALIRON_WRAPPER = 'https://valiron-edge-proxy.onrender.com/wrap/f89c87a0-caee-4b69-b402-1008b34c94fa/crypto-free';
app.get('/health', (req, res) => res.json({ status: 'ok' }));
async function handleAgentCall(agentId, res) {
  try {
    const route = await valiron.checkAgent(agentId, { chain: 'ethereum' });
    const allowed = route === 'prod' || route === 'prod_throttled';
    if (!allowed) return res.status(403).json({ blocked: true, agentId, route });
    const d = await (await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd')).json();
    res.json({ blocked: false, agentId, route, data: d });
  } catch(e) { res.status(500).json({ error: e.message }); }
}
app.get('/api/call/good', (req, res) => handleAgentCall(GOOD_AGENT_ID, res));
app.get('/api/call/bad', (req, res) => handleAgentCall(BAD_AGENT_ID, res));
app.post('/api/register-agent', async (req, res) => {
  const { agentName, agentType, description } = req.body;
  try {
    const wallet = ethers.Wallet.createRandom();
    const agentAddress = wallet.address;
    console.log('Step 1: wallet', agentAddress);
    console.log('Step 2: calling Valiron wrapper...');
    const firstCall = await fetch(VALIRON_WRAPPER + '?ids=bitcoin&vs_currencies=usd', {
      headers: {
        'x-agent-address': agentAddress,
        'x-agent-id': agentAddress,
      }
    });
    const firstBody = await firstCall.text();
    console.log('Step 2 status:', firstCall.status, firstBody.slice(0,200));
    let firstResponse;
    try { firstResponse = JSON.parse(firstBody); } catch(e) { firstResponse = {}; }
    let verified = false, score = null, tier = null, riskLevel = null;
    if (firstResponse.challenge) {
      console.log('Step 3: signing challenge...');
      const signature = await wallet.signMessage(firstResponse.challenge);
      const secondCall = await fetch(VALIRON_WRAPPER + '?ids=bitcoin&vs_currencies=usd', {
        headers: {
          'x-agent-address': agentAddress,
          'x-agent-id': agentAddress,
          'x-agent-signature': signature,
          'x-agent-challenge': firstResponse.challenge,
        }
      });
      const secondBody = await secondCall.text();
      console.log('Step 4 status:', secondCall.status, secondBody.slice(0,200));
      verified = secondCall.status === 200;
      const vTier = secondCall.headers.get('x-valiron-tier');
      const vRoute = secondCall.headers.get('x-valiron-route');
      const vScore = secondCall.headers.get('x-valiron-score');
      console.log('Valiron headers:', vTier, vRoute, vScore);
      if (vTier) tier = vTier;
      if (vScore) score = parseInt(vScore);
    } else if (firstCall.status === 200) {
      verified = true;
      tier = firstCall.headers.get('x-valiron-tier');
      score = parseInt(firstCall.headers.get('x-valiron-score'));
    }
    res.json({ success: true, verified, agent: { name: agentName, type: agentType, description, address: agentAddress, score, tier, riskLevel, route: verified ? 'prod' : 'sandbox', sandboxRan: verified, createdAt: new Date().toISOString() }});
  } catch(e) { res.status(500).json({ error: e.message }); }
});
const PORT = process.env.PORT || 3001;
init().then(() => app.listen(PORT, () => console.log('Server running on port ' + PORT)));
