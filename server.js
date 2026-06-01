const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json());
let valiron;
async function initValiron() {
  const { ValironSDK } = await import('@valiron/sdk');
  valiron = new ValironSDK({ apiKey: 'val_op_fe62e9f017d79f18c592bb0ee2e89e3b06f45239475e104557b8679b8afb641d', chain: 'ethereum' });
  console.log('Valiron SDK initialized');
}
const GOOD_AGENT_ID = '25459';
const BAD_AGENT_ID = '8348';
app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.get('/api/call/good', async (req, res) => {
  try {
    const gate = await valiron.gate(GOOD_AGENT_ID, { minScore: 60 });
    if (!gate.allow) return res.status(403).json({ blocked: true, score: gate.score, tier: gate.tier });
    const d = await (await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd')).json();
    res.json({ blocked: false, score: gate.score, tier: gate.tier, data: d });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/call/bad', async (req, res) => {
  try {
    const gate = await valiron.gate(BAD_AGENT_ID, { minScore: 60 });
    if (!gate.allow) return res.status(403).json({ blocked: true, score: gate.score, tier: gate.tier });
    const d = await (await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd')).json();
    res.json({ blocked: false, score: gate.score, tier: gate.tier, data: d });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
const PORT = process.env.PORT || 3001;
initValiron().then(() => app.listen(PORT, () => console.log('Server running on port ' + PORT)));
