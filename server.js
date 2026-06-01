const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

let ValironSDK;
let valiron;

async function initValiron() {
  const mod = await import('@valiron/sdk');
  ValironSDK = mod.ValironSDK;
  valiron = new ValironSDK({
    apiKey: 'val_op_fe62e9f017d79f18c592bb0ee2e89e3b06f45239475e104557b8679b8afb641d',
    chain: 'ethereum',
  });
  console.log('Valiron SDK initialized');
}

const GOOD_AGENT_ID = '25459';
const BAD_AGENT_ID = '8348';

app.get('/api/call/:agentType', async (req, res) => {
  const { agentType } = req.params;
  const agentId = agentType === 'good' ? GOOD_AGENT_ID : BAD_AGENT_ID;
  const coin = req.query.coin || 'bitcoin';

  try {
    const gate = await valiron.gate(agentId, {
      minScore: 60,
      trustSignals: ['8004', 'sandbox', 'world', 'icebreaker'],
    });

    if (!gate.allow) {
      return res.status(403).json({
        blocked: true,
        agentId,
        score: gate.score,
        tier: gate.tier,
        riskLevel: gate.riskLevel,
        reasons: gate.reasons || [],
        message: 'Agent blocked by Valiron',
      });
    }

    const cryptoRes = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coin}&vs_currencies=usd`);
    const cryptoData = await cryptoRes.json();

    res.json({
      blocked: false,
      agentId,
      score: gate.score,
      tier: gate.tier,
      riskLevel: gate.riskLevel,
      data: cryptoData,
      message: 'Agent allowed by Valiron',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3001;

initValiron().then(() => {
  app.listen(PORT, () => console.log('Server running on port ' + PORT));
});
