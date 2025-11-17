import express from 'express';

const router = express.Router();

// In-memory product store (replace with database later)
let products = [
  {
    id: 1,
    title: "Premium JavaScript Course",
    price: 49.99,
    currency: "USD",
    thumbnail: "https://via.placeholder.com/300x200/667eea/ffffff?text=JavaScript+Course",
    description: "Master modern JavaScript with hands-on projects",
    category: "Courses",
    inStock: true,
    rating: 4.8,
    reviews: 1250,
    created: new Date().toISOString(),
  },
  {
    id: 2,
    title: "React Development Bootcamp",
    price: 79.99,
    currency: "USD",
    thumbnail: "https://via.placeholder.com/300x200/61dafb/000000?text=React+Bootcamp",
    description: "Build professional React applications from scratch",
    category: "Courses",
    inStock: true,
    rating: 4.9,
    reviews: 890,
    created: new Date().toISOString(),
  },
  {
    id: 3,
    title: "TypeScript Essentials",
    price: 39.99,
    currency: "USD",
    thumbnail: "https://via.placeholder.com/300x200/3178c6/ffffff?text=TypeScript",
    description: "Learn TypeScript for type-safe development",
    category: "Books",
    inStock: true,
    rating: 4.7,
    reviews: 560,
    created: new Date().toISOString(),
  },
  {
    id: 4,
    title: "Full-Stack Developer Bundle",
    price: 199.99,
    currency: "USD",
    thumbnail: "https://via.placeholder.com/300x200/764ba2/ffffff?text=Full+Stack",
    description: "Complete frontend, backend, and DevOps bundle",
    category: "Bundles",
    inStock: false,
    rating: 5.0,
    reviews: 320,
    created: new Date().toISOString(),
  },
  {
    id: 5,
    title: "AWS Cloud Fundamentals",
    price: 59.99,
    currency: "USD",
    thumbnail: "https://via.placeholder.com/300x200/FF9900/000000?text=AWS+Course",
    description: "Master AWS services and cloud architecture",
    category: "Courses",
    inStock: true,
    rating: 4.6,
    reviews: 740,
    created: new Date().toISOString(),
  },
];

// GET all products
router.get('/', (req, res) => {
  const { category, inStock, minPrice, maxPrice, search } = req.query;
  
  let filtered = [...products];
  
  // Filter by category
  if (category) {
    filtered = filtered.filter(p => 
      p.category.toLowerCase() === category.toLowerCase()
    );
  }
  
  // Filter by stock status
  if (inStock !== undefined) {
    filtered = filtered.filter(p => p.inStock === (inStock === 'true'));
  }
  
  // Filter by price range
  if (minPrice) {
    filtered = filtered.filter(p => p.price >= parseFloat(minPrice));
  }
  if (maxPrice) {
    filtered = filtered.filter(p => p.price <= parseFloat(maxPrice));
  }
  
  // Search by title or description
  if (search) {
    const searchLower = search.toLowerCase();
    filtered = filtered.filter(p =>
      p.title.toLowerCase().includes(searchLower) ||
      p.description.toLowerCase().includes(searchLower)
    );
  }
  
  res.json({
    success: true,
    count: filtered.length,
    total: products.length,
    products: filtered,
    timestamp: new Date().toISOString(),
  });
});

// GET single product by ID
router.get('/:id', (req, res) => {
  const product = products.find(p => p.id === parseInt(req.params.id));
  
  if (!product) {
    return res.status(404).json({
      success: false,
      error: 'Product not found',
    });
  }
  
  res.json({
    success: true,
    product,
  });
});

// POST create new product
router.post('/', (req, res) => {
  const {
    title,
    price,
    thumbnail,
    description,
    category,
    inStock = true,
  } = req.body;
  
  // Validation
  if (!title || !price) {
    return res.status(400).json({
      success: false,
      error: 'Title and price are required',
    });
  }
  
  const newProduct = {
    id: products.length > 0 ? Math.max(...products.map(p => p.id)) + 1 : 1,
    title,
    price: parseFloat(price),
    currency: "USD",
    thumbnail: thumbnail || `https://via.placeholder.com/300x200?text=${encodeURIComponent(title)}`,
    description: description || '',
    category: category || 'Uncategorized',
    inStock: inStock === true || inStock === 'true',
    rating: 0,
    reviews: 0,
    created: new Date().toISOString(),
  };
  
  products.push(newProduct);
  
  res.status(201).json({
    success: true,
    message: 'Product created successfully',
    product: newProduct,
  });
});

// PUT update product
router.put('/:id', (req, res) => {
  const index = products.findIndex(p => p.id === parseInt(req.params.id));
  
  if (index === -1) {
    return res.status(404).json({
      success: false,
      error: 'Product not found',
    });
  }
  
  // Update fields
  products[index] = {
    ...products[index],
    ...req.body,
    id: products[index].id, // Preserve ID
    created: products[index].created, // Preserve creation date
    updated: new Date().toISOString(),
  };
  
  res.json({
    success: true,
    message: 'Product updated successfully',
    product: products[index],
  });
});

// DELETE product
router.delete('/:id', (req, res) => {
  const index = products.findIndex(p => p.id === parseInt(req.params.id));
  
  if (index === -1) {
    return res.status(404).json({
      success: false,
      error: 'Product not found',
    });
  }
  
  const deleted = products.splice(index, 1)[0];
  
  res.json({
    success: true,
    message: 'Product deleted successfully',
    product: deleted,
  });
});

// GET categories
router.get('/meta/categories', (req, res) => {
  const categories = [...new Set(products.map(p => p.category))];
  
  res.json({
    success: true,
    categories,
    count: categories.length,
  });
});

// GET statistics
router.get('/meta/stats', (req, res) => {
  const stats = {
    totalProducts: products.length,
    inStock: products.filter(p => p.inStock).length,
    outOfStock: products.filter(p => !p.inStock).length,
    categories: [...new Set(products.map(p => p.category))].length,
    averagePrice: products.reduce((sum, p) => sum + p.price, 0) / products.length,
    totalValue: products.reduce((sum, p) => sum + p.price, 0),
  };
  
  res.json({
    success: true,
    stats,
  });
});

export default router;

