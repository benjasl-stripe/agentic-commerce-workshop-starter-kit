export interface Product {
  title: string;
  price: string | number;
  thumbnail?: string;
  [key: string]: any; // Allow additional properties
}

export async function fetchProducts(apiUrl: string): Promise<Product[]> {
  if (!apiUrl || !apiUrl.trim()) {
    console.log('fetchProducts: No API URL provided');
    return [];
  }

  console.log('fetchProducts: Fetching from', apiUrl);

  try {
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      console.error('fetchProducts: Failed -', response.status, response.statusText);
      return [];
    }

    const data = await response.json();
    console.log('fetchProducts: Received data:', data);
    
    // Handle different response formats
    // Assume it's either an array directly or has a 'products' property
    const products = Array.isArray(data) ? data : (data.products || []);
    
    console.log('fetchProducts: Parsed', products.length, 'products');
    return products;
  } catch (error) {
    console.error('fetchProducts: Error -', error);
    return [];
  }
}

export function formatProductsForAI(products: Product[]): string {
  if (!products || products.length === 0) {
    return 'No products are currently available.';
  }

  const productList = products.map((product, index) => {
    const parts = [
      `${index + 1}. **${product.title}**`,
      `   - Price: ${product.price}`,
    ];
    
    if (product.thumbnail) {
      parts.push(`   - Image: ${product.thumbnail}`);
    }
    
    // Add any additional properties
    Object.keys(product).forEach(key => {
      if (!['title', 'price', 'thumbnail'].includes(key)) {
        parts.push(`   - ${key}: ${product[key]}`);
      }
    });
    
    return parts.join('\n');
  }).join('\n\n');

  return `Available Products (${products.length}):\n\n${productList}`;
}

