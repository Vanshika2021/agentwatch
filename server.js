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

    // Step 2: First call with just x-agent-address to get challenge
    console.log('Step 2: getting challenge...');
    const call1 = await fetch(VALIRON_WRAPPER + '?ids=bitcoin&vs_currencies=usd', {
      headers: { 'x-agent-address': agentAddress }
    });
    const body1 = await call1.json();
    console.log('Step 2 response:', call1.status, JSON.stringify(body1).slice(0,200));

    let verified = false, score = null, tier = null, riskLevel = null, sessionToken = null;

    // Step 3: If challenge_required, sign it
    if (body1.error === 'challenge_required' && body1.challenge) {
      console.log('Step 3: signing challenge...');
      const signature = await wallet.signMessage(body1.challenge);

      // Step 4: Retry with all three headers
      console.log('Step 4: retrying with signature...');
      const call2 = await fetch(VALIRON_WRAPPER + '?ids=bitcoin&vs_currencies=usd', {
        headers: {
          'x-agent-address': agentAddress,
          'x-agent-signature': signature,
          'x-agent-challenge': body1.challenge,
        }
      });
      const body2 = await call2.json();
      console.log('Step 4 response:', call2.status, JSON.stringify(body2).slice(0,200));

      sessionToken = call2.headers.get('x-agent-session');
      tier = call2.headers.get('x-valiron-tier');
      score = call2.headers.get('x-valiron-score');
      riskLevel = call2.headers.get('x-valiron-risk');
      console.log('Headers:', { sessionToken, tier, score, riskLevel });
      verified = call2.status === 200;

    } else if (call1.status === 200) {
      verified = true;
      tier = call1.headers.get('x-valiron-tier');
      score = call1.headers.get('x-valiron-score');
    }

    res.json({
      success: true, verified,
      agent: {
        name: agentName, type: agentType, description,
        address: agentAddress, score: score ? parseInt(score) : null,
        tier, riskLevel,
        route: verified ? (tier?.startsWith('A') ? 'prod' : 'prod_throttled') : 'sandbox',
        sandboxRan: verified,
        createdAt: new Date().toISOString()
      }
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
const PORT = process.env.PORT || 3001;
init().then(() => app.listen(PORT, () => console.log('Server running on port ' + PORT)));
