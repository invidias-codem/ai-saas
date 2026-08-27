import nlp from 'compromise';

export interface ExtractedEntities {
  people: string[];
  places: string[];
  organizations: string[];
  dates: string[];
  values: string[];
}

export function extractDeterministicEntities(text: string): ExtractedEntities {
  const doc = nlp(text);
  return {
    people: doc.people().out('array'),
    places: doc.places().out('array'),
    organizations: doc.organizations().out('array'),
    dates: doc.dates().out('array'),
    values: doc.values().out('array'),
  };
}
