const fs = require('fs');
const path = require('path');
const request = require('request-promise-native');
const cheerio = require('cheerio');

const MYSPACE_USERNAME = 'f3ather';
const WEBHOOK_URL = 'xxx';
const MONITOR_INTERVAL = 3500;

let cache = new Map();

const ProxyRegex = /^(\d+\.\d+\.\d+\.\d+)\:(\d+)\:([^\:]*)\:([^\$]*)$/g;
const proxies = [];

const parseProxies = async () => {
  return new Promise((resolve, reject) => {
    const lineReader = require('readline').createInterface({
      input: fs.createReadStream(path.join(__dirname, 'proxies.txt'))
    });

    lineReader.on('line', line => {
      const matches = ProxyRegex.exec(line);

      if (matches && matches.length >= 2) {
        const [, ip, port, user, pass] = matches;

        const newProxyFormat = `http://${user}:${pass}@${ip}:${port}`;

        proxies.push(newProxyFormat);
      }
    });

    lineReader.on('close', () => {
      return resolve();
    });
  });
};

const makeRequest = async proxyIndex => {
  const params = {
    url: `https://myspace.com/${MYSPACE_USERNAME}`,
    method: 'GET',
    headers: {
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/77.0.3865.90 Safari/537.36'
    }
  };

  if (proxyIndex && proxies.length > 0) {
    params.proxy = proxies[proxyIndex];
  }

  try {
    const body = await request(params);

    return body;
  } catch (e) {
    console.error(e);
    throw new Error('Error fetching data');
  }
};

// .postText
const parseData = async data => {
  const $ = cheerio.load(data);

  // look for photos on stream
  $('.photoObject').each(async (i, el) => {
    const identifier = $(el)
      .find('[data-entity-key]')
      .attr('data-entity-key');

    if (!cache.has(identifier)) {
      const imgUrl = $(el)
        .find('[data-image-url]')
        .attr('data-image-url');

      const textEl = $(el)
        .parent()
        .parent()
        .find('.postText');

      let text = null;

      if (textEl) {
        text = textEl.text();
      }

      cache.set(identifier, { text, image: imgUrl });

      await alert(identifier, text, imgUrl);
    }
  });

  // otherwise it's just a text post
  $('.statusPost').each(async (i, el) => {
    const identifier = $(el)
      .find('[data-entity-key]')
      .attr('data-entity-key');

    if (!cache.has(identifier)) {
      const txt = $(el)
        .find('.postText')
        .text();

      cache.set(identifier, { text: txt });

      await alert(identifier, txt, null);
    }
  });
};

const buildEmbed = (content, imageUrl) => {
  const embed = {
    title: `New Content`,
    url: 'https://myspace.com/${MYSPACE_USERNAME}',
    color: 9903813,
    timestamp: new Date().toISOString(),
    footer: {
      icon_url:
        'https://cdn.discordapp.com/app-icons/520849817988104207/10c1a280fb12480f6feb512fb600866a.png?size=256',
      text: 'Powered by Lightspeed'
    }
  };

  if (imageUrl) {
    embed.image = {
      url: imageUrl
    };
  }

  if (content) {
    embed.description = content;
  }

  return embed;
};
const alert = async (identifier, content, imageUrl) => {
  const embed = buildEmbed(content, imageUrl);

  const params = {
    url: WEBHOOK_URL,
    method: 'POST',
    json: true,
    body: {
      username: `${MYSPACE_USERNAME} Myspace Monitor`,
      avatar_url:
        'https://cdn.discordapp.com/app-icons/520849817988104207/10c1a280fb12480f6feb512fb600866a.png?size=256',
      embeds: [embed]
    }
  };

  try {
    await request(params);
  } catch (e) {
    console.error(e);
    setTimeout(async () => await alert(identifier, content, isImage), 1000);
  }

  console.log(`[NEW CONTENT] [${identifier}] ${content} (${imageUrl})`);
};

const scrape = async proxyIndex => {
  try {
    const data = await makeRequest(proxyIndex);

    const result = await parseData(data);

    fs.writeFile(
      path.join(__dirname, 'data.json'),
      JSON.stringify([...cache]),
      e => {
        if (e) {
          console.error(e);
        }
      }
    );
  } catch (e) {
    console.error(e);
  }
};

const monitor = async () => {
  let proxyIndex = 0;

  setInterval(async () => {
    if (proxyIndex < proxies.length) {
      proxyIndex += 1;
    } else if (proxyIndex >= proxies.length) {
      proxyIndex = 0;
    }

    await scrape(proxyIndex);
  }, MONITOR_INTERVAL);
};

const start = async () => {
  // load data

  console.log('[INFO] Loading proxies');

  if (fs.existsSync(path.join(__dirname, 'proxies.txt'))) {
    await parseProxies();
  }

  console.log(`[INFO] Loaded ${proxies.length} proxies`);

  console.log(`[INFO] Starting`);

  if (fs.existsSync(path.join(__dirname, 'data.json'))) {
    try {
      const data = fs.readFileSync(path.join(__dirname, 'data.json'));

      const json = await JSON.parse(data);

      cache = new Map(json);
    } catch (e) {
      console.error(e);
      process.exit(1);
    }
  }

  await monitor();
};

start();
