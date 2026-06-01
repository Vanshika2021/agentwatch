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
  valiron = new ValironSDK({ apiKey: 'val_op_fe62e9f017d79f18c592bb0ee2e89e3b06f45239475e104557b8679b8afb641d', chain: 'ethereum' });
  console.log('Valiron SDK initialized');
}
const GOOD_AGENT_ID = '25459';
const BAD_AGENT_ID = '8348';
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
    let challengeOk = false;
    try {
      const cr = await valiron.getKeyAgentChallenge(agentAddress);
      console.log('Step 2: challenge ok');
      const sig = await wallet.signMessage(cr.challenge);
      await valiron.verifyKeyAgent({ challenge: cr.challenge, signature: sig, agentAddress });
      challengeOk = true;
    } catch(e) { console.log('Step 2 error:', e.message, e.statusCode); }
    let score=null,tier=null,riskLevel=null,sandboxRan=false;
    try {
      console.log('Step 3: triggering sandbox...');
      const sb = await valiron.triggerKeyAgentSandbox(agentAddress);
      console.log('Step 3 result:', JSON.stringify(sb));
      score=sb.valironScore; tier=sb.tier; riskLevel=sb.riskLevel; sandboxRan=true;
    } catch(e) { console.log('Step 3 error:', e.message, e.statusCode); }
    res.json({ success:true, challengeOk, sandboxRan, agent:{ name:agentName, type:agentType, description, address:agentAddress, score, tier, riskLevel, route: riskLevel==='GREEN'?'prod':riskLevel==='YELLOW'?'prod_throttled':'sandbox', sandboxRan, createdAt:new Date().toISOString() }});
  } catch(e) { res.status(500).json({ error: e.message }); }
});
const PORT = process.env.PORT || 3001;
init().then(() => app.listen(PORT, () => console.log('Server running on port ' + PORT)));
