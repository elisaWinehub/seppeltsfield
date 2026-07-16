import { execFileSync } from 'node:child_process';

const STORE = 'seppeltsfield.myshopify.com';

const MENU_DEFINITIONS = [
  {
    handle: 'main-menu',
    title: 'Main menu',
    items: [
      { title: 'Discover', url: '/pages/discover' },
      { title: 'Visit', url: '/pages/visit' },
      { title: 'Shop', url: '/collections' },
      { title: 'Wine Club', url: '/pages/wine-club' },
      { title: 'Functions & events', url: '/pages/functions-events' },
    ],
  },
  {
    handle: 'footer-discover',
    title: 'Footer — Discover',
    items: [
      { title: 'History', url: '/pages/heritage-story' },
      { title: 'Sustainability', url: '/pages/discover' },
      { title: 'Awards & Recognition', url: '/pages/discover' },
    ],
  },
  {
    handle: 'footer-visit',
    title: 'Footer — Visit',
    items: [
      { title: 'Plan Your Visit', url: '/pages/plan-your-visit' },
      { title: 'Cellar Door', url: '/pages/visit' },
      { title: 'FINO Restaurant', url: '/pages/visit' },
      { title: 'Accommodation', url: '/pages/visit' },
    ],
  },
  {
    handle: 'footer-wine',
    title: 'Footer — Wine',
    items: [
      { title: 'Wine Collections', url: '/collections' },
      { title: 'All Wines', url: '/collections/all' },
      { title: 'Limited Releases', url: '/collections/all' },
      { title: 'Gift Vouchers', url: '/collections/all' },
    ],
  },
  {
    handle: 'footer-contact',
    title: 'Footer — Contact',
    items: [
      { title: '(08) 8562 4377', url: 'tel:+61885624377' },
      { title: 'info@seppeltsfield.com.au', url: 'mailto:info@seppeltsfield.com.au' },
      {
        title: '730 Seppeltsfield Road, SA 5355',
        url: 'https://maps.google.com/?q=730+Seppeltsfield+Road,+Seppeltsfield+SA+5355',
      },
    ],
  },
];

function runGraphql(query, variables = {}, allowMutations = false) {
  const args = [
    'store',
    'execute',
    '-s',
    STORE,
    '-q',
    query,
    '-v',
    JSON.stringify(variables),
    '--json',
  ];
  if (allowMutations) args.push('--allow-mutations');

  const shopifyCmd = process.platform === 'win32' ? 'shopify.cmd' : 'shopify';

  const output = execFileSync(shopifyCmd, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const payload = JSON.parse(output);
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).join('; '));
  }
  return payload.data;
}

function toMenuItems(items) {
  return items.map((item) => ({
    title: item.title,
    type: 'HTTP',
    url: item.url,
  }));
}

async function listMenus() {
  const data = runGraphql(`
    query ListMenus {
      menus(first: 50) {
        nodes {
          id
          handle
          title
        }
      }
    }
  `);
  return data.menus.nodes;
}

async function upsertMenu(definition, existingMenus) {
  const existing = existingMenus.find((menu) => menu.handle === definition.handle);
  const items = toMenuItems(definition.items);

  if (!existing) {
    const data = runGraphql(
      `
        mutation CreateMenu($title: String!, $handle: String!, $items: [MenuItemCreateInput!]!) {
          menuCreate(title: $title, handle: $handle, items: $items) {
            menu { id handle title }
            userErrors { field message }
          }
        }
      `,
      {
        title: definition.title,
        handle: definition.handle,
        items,
      },
      true
    );

    const result = data.menuCreate;
    if (result.userErrors?.length) {
      throw new Error(`${definition.handle}: ${result.userErrors.map((e) => e.message).join('; ')}`);
    }
    console.log(`Created menu: ${result.menu.handle}`);
    return;
  }

  const data = runGraphql(
    `
      mutation UpdateMenu($id: ID!, $title: String!, $items: [MenuItemUpdateInput!]!) {
        menuUpdate(id: $id, title: $title, items: $items) {
          menu { id handle title }
          userErrors { field message }
        }
      }
    `,
    {
      id: existing.id,
      title: definition.title,
      items,
    },
    true
  );

  const result = data.menuUpdate;
  if (result.userErrors?.length) {
    throw new Error(`${definition.handle}: ${result.userErrors.map((e) => e.message).join('; ')}`);
  }
  console.log(`Updated menu: ${result.menu.handle}`);
}

async function main() {
  const existingMenus = await listMenus();
  for (const definition of MENU_DEFINITIONS) {
    await upsertMenu(definition, existingMenus);
  }
  console.log('Navigation menus synced.');
}

main().catch((error) => {
  console.error(error.message || error);
  console.error(
    '\nIf access is denied, run:\n  shopify store auth -s seppeltsfield.myshopify.com --scopes read_online_store_navigation,write_online_store_navigation\nThen rerun:\n  node scripts/sync-navigation-menus.mjs'
  );
  process.exit(1);
});
