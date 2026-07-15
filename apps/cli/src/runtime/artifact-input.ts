export function artifactInputExpression(input: unknown) {
  const json = JSON.stringify(input);
  if (json === undefined) throw new TypeError('Artifact Input must be JSON-serializable');
  return `JSON.parse(${JSON.stringify(json)})`;
}
