// Validation rules shared by the owner and admin routes.
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
};

module.exports = { RESTAURANT_RULES, DISH_RULES };
