# On-Page SEO Patterns

Every page generated follows these SEO patterns.

## Title tag

    {service} in {city}, {state} | {brand}

Example: Roof Cleaning in Knoxville, TN | Apex Pro

## Meta description

    Looking for {service} in {city}? {brand} serves {city} and surrounding areas.
    Free quotes. Call today.

## Schema.org markup

    {
      "@context": "https://schema.org",
      "@type": "LocalBusiness",
      "name": "{brand}",
      "areaServed": "{city}",
      "serviceType": "{service}",
      "telephone": "{phone}"
    }

## URL structure

    /{service-slug}/{city-slug}/

Example: /roof-cleaning/knoxville-tn/

## Internal linking

Hub-and-spoke: each city page links to the service hub,
each service hub links to all city variations.
