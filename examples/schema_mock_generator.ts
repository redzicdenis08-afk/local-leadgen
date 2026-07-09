export function generateLocalBusinessSchema(name: string, city: string) {
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "name": name,
    "address": {
      "@type": "PostalAddress",
      "addressLocality": city
    }
  };
}
