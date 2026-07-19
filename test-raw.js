const axios = require('axios');

async function test() {
  try {
    const { data } = await axios.get('https://www.amazon.com/Bissell-Multi-Purpose-Portable-Upholstery-1400B/dp/B0016HF5GK?ref=dlx_deals_dg_dcl_B0016HF5GK_dt_sl14_0b_pi&pf_rd_r=TN7JP3TS8KCX1ZA91KRN&pf_rd_p=f113b82f-d107-4fbd-801a-5c788b58370b&sbo=RZvfv%2F%2FHxDF%2BO5021pAnSA%3D%3D', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
      }
    });
    console.log(data.substring(0, 500));
  } catch (err) {
    console.error('Error:', err.message);
  }
}

test();
