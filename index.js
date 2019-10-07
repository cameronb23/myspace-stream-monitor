const fs = require('fs');
const path = require('path');
const request = require('request-promise-native');
const cheerio = require('cheerio');

const MYSPACE_USERNAME = 'cgalt23';
const WEBHOOK_URL = 'xxx';
const MONITOR_INTERVAL = 3500;

let cache = new Map();

const makeRequest = async () => {
  const params = {
    url: `https://myspace.com/${MYSPACE_USERNAME}`,
    method: 'GET',
    headers: {
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/77.0.3865.90 Safari/537.36'
    }
  };

  try {
    const body = await request(params);

    return body;
  } catch (e) {
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

const scrape = async () => {
  try {
    const data = await makeRequest();

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

const start = async () => {
  // load data
  const id = setInterval(async () => {
    await scrape();
  }, 3500);
  fs.readFile(path.join(__dirname, 'data.json'), async (e, data) => {
    if (e) {
      console.error(e);
      process.exit(1);
    }

    try {
      const json = await JSON.parse(data);

      cache = new Map(json);

      const id = setInterval(async () => {
        await scrape();
      }, MONITOR_INTERVAL);
    } catch (e) {
      console.error(e);
      process.exit(1);
    }
  });
};

start();
