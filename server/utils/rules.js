// Validation rules shared by the owner and admin routes.
const ALLERGENS = ['gluten', 'dairy', 'eggs', 'nuts', 'fish', 'shellfish', 'soy', 'sesame'];
const AUDIENCES = ['kids', 'sharing', 'sport', 'light', 'halal', 'vegan', 'gluten_free'];
const RESTAURANT_RULES = {
  name: { type: 'string', required: true, min: 2, max: 100, label: 'Restaurant name' },
  cuisine_id: { type: 'int', required: true, min: 1, label: 'Cuisine' },
  description: { type: 'string', required: true, min: 20, max: 1500 },
  city: { type: 'string', required: true, min: 2, max: 60 },
  address: { type: 'string', required: true, min: 5, max: 160 },
  phone: { type: 'phone' },
  website: { type: 'url', max: 200 },
  price_level: { type: 'int', required: true, min: 1, max: 4, label: 'Price level' },
  opens_at: { type: 'time', label: 'Opening time' },
  closes_at: { type: 'time', label: 'Closing time' },
  image_url: { type: 'url', label: 'Image URL' },
};

const DISH_RULES = {
  name: { type: 'string', required: true, min: 2, max: 100, label: 'Dish name' },
  description: { type: 'string', max: 400 },
  category: { type: 'enum', required: true, values: ['Starters', 'Mains', 'Sides', 'Desserts', 'Drinks'] },
  price: { type: 'number', required: true, min: 0, max: 1000000 },
  image_url: { type: 'url', label: 'Image URL' },
  is_vegetarian: { type: 'bool' },
  is_spicy: { type: 'bool' },
  is_available: { type: 'bool' },
  weight_g: { type: 'int', min: 1, max: 5000, label: 'Portion weight' },
  calories: { type: 'int', min: 0, max: 10000 },
  protein_g: { type: 'number', min: 0, max: 1000, label: 'Protein' },
  fat_g: { type: 'number', min: 0, max: 1000, label: 'Fat' },
  carbs_g: { type: 'number', min: 0, max: 1000, label: 'Carbohydrates' },
  allergens: { type: 'set', values: ALLERGENS },
  recommended_for: { type: 'set', values: AUDIENCES, label: 'Recommended for' },
};

module.exports = { RESTAURANT_RULES, DISH_RULES, ALLERGENS, AUDIENCES };
