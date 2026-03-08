import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

async function seedNavigation() {
  const uri = process.env.MONGODB_URI_LOCAL;
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db('hbs-ecommerce');
    const categories = db.collection('categories');
    const menus = db.collection('navigationmenus');

    // 1. Clear existing header menus
    await menus.deleteMany({ position: 'header' });

    // 2. Fetch ALL active categories
    const allCategories = await categories.find({ 
      isDeleted: false, 
      status: 'active' 
    }).toArray();

    // Helper: Recursively build the menu item structure
    const buildMenuItems = (parentId = null) => {
      return allCategories
        .filter(cat => {
          if (parentId === null) {
            return cat.level === 0 || !cat.parentId;
          }
          // Use .toString() to ensure ObjectId comparison works correctly
          return cat.parentId?.toString() === parentId.toString();
        })
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map(cat => {
          const children = buildMenuItems(cat._id);
          return {
            _id: new ObjectId(),
            itemType: 'category',
            label: cat.name,
            link: `/category/${cat.slug}`,
            categoryId: cat._id,
            isVisible: true,
            showOnMobile: true,
            openInNewTab: false,
            displayOrder: cat.displayOrder,
            // Even if children is empty [], it will be included
            children: children 
          };
        });
    };

    const menuItems = buildMenuItems();

    // 3. Create the Menu Document
    const navigationDoc = {
      position: 'header',
      menuItems: menuItems,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      __v: 0
    };

    await menus.insertOne(navigationDoc);

    // --- DEBUG LOG ---
    // This allows you to see the "Turkish Lawn Hijabs" -> "Large" nesting in the console
    console.log("Structure check (Daily Wear -> Hijabs -> Lawn -> Turkish):");
    const dailyWear = menuItems.find(m => m.label === 'Daily Wear');
    const hijabs = dailyWear?.children.find(c => c.label === 'Hijabs');
    const lawn = hijabs?.children.find(c => c.label === 'Lawn Hijabs');
    const turkish = lawn?.children.find(c => c.label === 'Turkish Lawn Hijabs');
    
    console.log(`Root Items: ${menuItems.length}`);
    console.log(`Turkish Lawn Children found: ${turkish?.children?.length || 0}`);
    
    console.log('Navigation menu seeded successfully.');
    
  } catch (err) {
    console.error('Error seeding navigation:', err);
  } finally {
    await client.close();
  }
}

seedNavigation();