import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

async function seedCategories() {
  const uri = process.env.MONGODB_URI_LOCAL;
  const client = new MongoClient(uri);

  const generateSlug = (name, parentSlug = '') => {
    const current = name.toLowerCase().replace(/[\s/&()]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    return parentSlug ? `${parentSlug}-${current}` : current;
  };

  try {
    await client.connect();
    const db = client.db('hbs-ecommerce');
    const categories = db.collection('categories');
    await categories.deleteMany({});

    const insertCategory = async (name, parentId = null, parentPath = [], parentSlug = '', level = 0, order = 1) => {
      const slug = generateSlug(name, parentSlug);
      const category = {
        name,
        slug,
        parentId,
        path: parentPath,
        level,
        displayOrder: order,
        description: '', coverImage: '', thumbnail: '',
        status: 'active', isDeleted: false,
        createdAt: new Date(), updatedAt: new Date()
      };
      const result = await categories.insertOne(category);
      return { id: result.insertedId, slug: category.slug };
    };

    // --- 1. HAJJ & UMRAH ---
    const hajj = await insertCategory('Hajj & Umrah', null, [], '', 0, 1);
    const hajjSubs = ['Cap Hijabs', 'Abayas', 'Jilbab', 'Khimar/Triple layer khimar', 'Modest dresses', 'Namaz chadder'];
    for (const [i, n] of hajjSubs.entries()) {
      await insertCategory(n, hajj.id, [hajj.id], hajj.slug, 1, i + 1);
    }
    const makhna = await insertCategory('Makhna (Scarf)', hajj.id, [hajj.id], hajj.slug, 1, 7);
    await insertCategory('Adults Makhna', makhna.id, [hajj.id, makhna.id], makhna.slug, 2, 1);
    await insertCategory('Kids Makhna', makhna.id, [hajj.id, makhna.id], makhna.slug, 2, 2);

    // --- 2. DAILY WEAR ---
    const daily = await insertCategory('Daily Wear', null, [], '', 0, 2);

    // HIJABS
    const hijabs = await insertCategory('Hijabs', daily.id, [daily.id], daily.slug, 1, 1);
    const hijabGroups = [
      { name: 'Silk Hijabs', items: ['Crinkle Silk Hijabs', 'Studded Silk Hijabs', 'Metallic Silk Hijabs', 'Organza Shimmer Silk Hijabs'] },
      { name: 'Georgette Hijabs', items: ['Basic Georgette Hijabs', 'Glitter Georgette Hijabs', 'Cross-hatch Georgette Hijabs', 'Instant Georgette Hijabs', 'Matching Georgette Hijab & Caps', 'Printed Georgette Hijabs'] },
      { name: 'Printed Hijabs', items: ['Lawn printed Hijabs', 'Georgette Printed Hijabs'] },
      { name: 'Modal Hijabs', items: ['Viscose Modal Hijabs', 'Imported Modal Hijabs'] },
      { 
        name: 'Lawn Hijabs', 
        items: [
          'Pleated Lawn Hijabs', 'Polka Dot Pleated Lawn Hijabs', 'Crumpled Lawn Hijabs', 'Printed Lawn Hijabs', 
          'Gold Foil Lawn Hijabs', 
          { name: 'Turkish Lawn Hijabs', children: ['Large', 'Standard'] }, 
          'Large-Solid Lawn Hijabs', 'Sequins Lawn', 'Gold Leaf Foil Lawn Hijabs'
        ] 
      },
      { name: 'Winter Hijabs', items: ['Plain Jersey Hijabs', 'Ribbed Jersey Hijabs', 'Cashmere Hijabs', 'Pashmina Hijabs', 'Self viscose Jacquard Hijabs'] }
    ];

    for (const [i, group] of hijabGroups.entries()) {
      const gNode = await insertCategory(group.name, hijabs.id, [daily.id, hijabs.id], hijabs.slug, 2, i + 1);
      for (const [j, item] of group.items.entries()) {
        if (typeof item === 'string') {
          await insertCategory(item, gNode.id, [daily.id, hijabs.id, gNode.id], gNode.slug, 3, j + 1);
        } else {
          const subNode = await insertCategory(item.name, gNode.id, [daily.id, hijabs.id, gNode.id], gNode.slug, 3, j + 1);
          for (const [k, child] of item.children.entries()) {
            await insertCategory(child, subNode.id, [daily.id, hijabs.id, gNode.id, subNode.id], subNode.slug, 4, k + 1);
          }
        }
      }
    }

    // NIQABS
    const niqabs = await insertCategory('Niqabs', daily.id, [daily.id], daily.slug, 1, 2);
    ['Crinkle Silk Niqabs', 'Georgette Niqabs', 'Niqab SALE offers'].forEach((n, i) => 
      insertCategory(n, niqabs.id, [daily.id, niqabs.id], niqabs.slug, 2, i + 1));

    // SETS
    const sets = await insertCategory('Hijab & Niqab Sets', daily.id, [daily.id], daily.slug, 1, 3);
    ['Crinkle Silk Sets', 'Georgette Chiffon Sets', 'Soft Chiffon Sets'].forEach((s, i) => 
      insertCategory(s, sets.id, [daily.id, sets.id], sets.slug, 2, i + 1));

    // CLOTHING
    const clothing = await insertCategory('Clothing', daily.id, [daily.id], daily.slug, 1, 4);
    ['Abayas', 'Jilbab', 'Khimar/Triple layer khimar', 'Modest Dresses'].forEach((c, i) => 
      insertCategory(c, clothing.id, [daily.id, clothing.id], clothing.slug, 2, i + 1));

    await insertCategory('Namaz chadar', daily.id, [daily.id], daily.slug, 1, 5);

    // --- 3. ESSENTIALS ---
    const ess = await insertCategory('Essentials', null, [], '', 0, 3);
    ['Hijab Pins', 'Hijab Magnets', 'Under-caps', 'Scrunchies', 'Hijab Hangers', 'Sleeves', 'Gloves'].forEach((n, i) => 
      insertCategory(n, ess.id, [ess.id], ess.slug, 1, i + 1));

    // --- 4. JEWELRY ---
    const jew = await insertCategory('Stainless Steel Jewelry', null, [], '', 0, 4);
    ['Lockets', 'Rings', 'Hand-chains', 'Studs', 'Sets', 'Anklets', 'Handcuffs', 'Bracelets', 'Watches'].forEach((n, i) => 
      insertCategory(n, jew.id, [jew.id], jew.slug, 1, i + 1));

    // --- 5. BUNDLES ---
    

    console.log('Categories successfully seeded without "View All" entries.');
  } finally {
    await client.close();
  }
}

seedCategories();