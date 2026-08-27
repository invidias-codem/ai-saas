import nlp from 'compromise';

export interface ExtractedEntities {
  people: string[];
  places: string[];
  organizations: string[];
  dates: string[];
  values: string[];
}

export function extractDeterministicEntities(text: string): ExtractedEntities {
  const doc = nlp(text) as any;

  // Compromise v14 ships people/places/organizations/values.
  // There is no `.dates()` here; use `#Date`/`#Money` regex matchers instead.
  const dateMatches = doc.match('#Date').out('array') as string[];
  const moneyMatches = doc.match('#Money').out('array') as string[];

  return {
    people: doc.people().out('array'),
    places: doc.places().out('array'),
    organizations: doc.organizations().out('array'),
    dates: dateMatches,
    values: moneyMatches.length ? moneyMatches : doc.values().out('array'),
  };
}
