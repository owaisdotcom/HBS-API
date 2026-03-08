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

    // 1. Clear existing menus
    await menus.deleteMany({ position: 'header' });

    // 2. Fetch all active categories to build the menu tree
    const allCategories = await categories.find({ isDeleted: false, status: 'active' }).toArray();

    // Helper: Recursively build the menu item structure
    const buildMenuItems = (parentId = null) => {
      return allCategories
        .filter(cat => 
          parentId === null 
            ? cat.level === 0  // Root categories
            : cat.parentId?.toString() === parentId.toString()
        )
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map(cat => ({
          _id: new ObjectId(),
          itemType: 'category',
          label: cat.name,
          link: `/category/${cat.slug}`,
          categoryId: cat._id,
          isVisible: true,
          showOnMobile: true,
          openInNewTab: false,
          displayOrder: cat.displayOrder,
          // Recursive call to get sub-categories as children
          children: buildMenuItems(cat._id)
        }));
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

    console.log(`Navigation menu seeded successfully with ${menuItems.length} root items.`);
    
  } catch (err) {
    console.error('Error seeding navigation:', err);
  } finally {
    await client.close();
  }
}

seedNavigation();