import { MongoClient } from 'mongodb';
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

    // --- Helper for insertion ---
    const insertNode = async (name, parentId = null, parentPath = [], parentSlug = '', order = 1, level = 0) => {
      const slug = generateSlug(name, parentSlug);
      const doc = {
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
      const result = await categories.insertOne(doc);
      return { id: result.insertedId, slug: doc.slug };
    };

    // --- 1. HAJJ & UMRAH ---
    const hajj = await insertNode('Hajj & Umrah', null, [], '', 1, 0);
    const hajjSubs = ['Cap Hijabs', 'Abayas', 'Jilbab', 'Khimar/Triple layer khimar', 'Modest dresses', 'Namaz chadder'];
    for (const [i, name] of hajjSubs.entries()) {
      await insertNode(name, hajj.id, [hajj.id], hajj.slug, i + 1, 1);
    }
    const makhna = await insertNode('Makhna (Scarf)', hajj.id, [hajj.id], hajj.slug, 7, 1);
    await insertNode('Adults Makhna', makhna.id, [hajj.id, makhna.id], makhna.slug, 1, 2);
    await insertNode('Kids Makhna', makhna.id, [hajj.id, makhna.id], makhna.slug, 2, 2);

    // --- 2. DAILY WEAR ---
    const daily = await insertNode('Daily Wear', null, [], '', 2, 0);

    // Hijabs Section
    const hijabs = await insertNode('Hijabs', daily.id, [daily.id], daily.slug, 1, 1);
    const hijabGroups = [
      { name: 'Silk Hijabs', items: ['Crinkle Silk Hijabs', 'Studded Silk Hijabs', 'Metallic Silk Hijabs', 'Organza Shimmer Silk Hijabs', 'VIEW ALL'] },
      { name: 'Georgette Hijabs', items: ['Basic Georgette Hijabs', 'Glitter Georgette Hijabs', 'Cross-hatch Georgette Hijabs', 'Instant Georgette Hijabs', 'Matching Georgette Hijab & Caps', 'Printed Georgette Hijabs', 'VIEW ALL'] },
      { name: 'Printed Hijabs', items: ['Lawn printed Hijabs', 'Georgette Printed Hijabs', 'VIEW ALL'] },
      { name: 'Modal Hijabs', items: ['Viscose Modal Hijabs', 'Imported Modal Hijabs', 'VIEW ALL'] },
      { name: 'Lawn Hijabs', items: [
          'Pleated Lawn Hijabs', 'Polka Dot Pleated Lawn Hijabs', 'Crumpled Lawn Hijabs', 'Printed Lawn Hijabs', 
          'Gold Foil Lawn Hijabs', 'Turkish Lawn Hijabs', 'Large-Solid Lawn Hijabs', 'Sequins Lawn', 'Gold Leaf Foil Lawn Hijabs', 'VIEW ALL'
        ] 
      },
      { name: 'Winter Hijabs', items: ['Plain Jersey Hijabs', 'Ribbed Jersey Hijabs', 'Cashmere Hijabs', 'Pashmina Hijabs', 'Self viscose Jacquard Hijabs', 'VIEW ALL'] }
    ];

    for (const [i, group] of hijabGroups.entries()) {
      const gNode = await insertNode(group.name, hijabs.id, [daily.id, hijabs.id], hijabs.slug, i + 1, 2);
      for (const [j, item] of group.items.entries()) {
        const itemNode = await insertNode(item, gNode.id, [daily.id, hijabs.id, gNode.id], gNode.slug, j + 1, 3);
        // Special case for Turkish Lawn Hijabs sub-sub-sub categories
        if (item === 'Turkish Lawn Hijabs') {
          await insertNode('Large', itemNode.id, [daily.id, hijabs.id, gNode.id, itemNode.id], itemNode.slug, 1, 4);
          await insertNode('Standard', itemNode.id, [daily.id, hijabs.id, gNode.id, itemNode.id], itemNode.slug, 2, 4);
        }
      }
    }

    // Niqabs, Sets, Clothing
    const niqabs = await insertNode('Niqabs', daily.id, [daily.id], daily.slug, 2, 1);
    for (const n of ['Crinkle Silk Niqabs', 'Georgette Niqabs', 'Niqab SALE offers']) {
      await insertNode(n, niqabs.id, [daily.id, niqabs.id], niqabs.slug, 1, 2);
    }

    const sets = await insertNode('Hijab & Niqab Sets', daily.id, [daily.id], daily.slug, 3, 1);
    for (const s of ['Crinkle Silk Sets', 'Georgette Chiffon Sets', 'Soft Chiffon Sets', 'ALL HIJAB NIQAB SETS']) {
      await insertNode(s, sets.id, [daily.id, sets.id], sets.slug, 1, 2);
    }

    const cloth = await insertNode('Clothing', daily.id, [daily.id], daily.slug, 4, 1);
    for (const c of ['Abayas', 'Jilbab', 'Khimar/Triple layer khimar', 'Modest Dresses', 'VIEW ALL']) {
      await insertNode(c, cloth.id, [daily.id, cloth.id], cloth.slug, 1, 2);
    }

    await insertNode('Namaz chadar', daily.id, [daily.id], daily.slug, 5, 1);

    // --- 3. ESSENTIALS ---
    const ess = await insertNode('Essentials', null, [], '', 3, 0);
    const essItems = ['Hijab Pins', 'Hijab Magnets', 'Under-caps', 'Scrunchies', 'Hijab Hangers', 'Sleeves', 'Gloves', 'ALL ACCESSORIES'];
    for (const [i, name] of essItems.entries()) {
      await insertNode(name, ess.id, [ess.id], ess.slug, i + 1, 1);
    }

    // --- 4. JEWELRY ---
    const jew = await insertNode('Stainless Steel Jewelry', null, [], '', 4, 0);
    const jewItems = ['Lockets', 'Rings', 'Hand-chains', 'Studs', 'Sets', 'Anklets', 'Handcuffs', 'Bracelets', 'Watches'];
    for (const [i, name] of jewItems.entries()) {
      await insertNode(name, jew.id, [jew.id], jew.slug, i + 1, 1);
    }


    console.log('Database seeded successfully with nested unique slugs!');
  } catch (err) {
    console.error('Error seeding database:', err);
  } finally {
    await client.close();
  }
}

seedCategories();