export const exampleDocument = {
  format: 'docx', pageCount: null,
  filename: 'Illustrative example — not a real study',
  markdown: '# A small study of study habits\n\n## Methods\n\nWe recruited 24 volunteers from one university. Participants selected their preferred study method.\n\n## Results\n\nThe difference was not statistically significant (p = 0.12). We therefore conclude that the two methods are equivalent.\n\n## Discussion\n\nThese findings demonstrate that both methods work equally well for all university students.',
  html: '<h1>A small study of study habits</h1><h2>Methods</h2><p>We recruited 24 volunteers from one university. Participants selected their preferred study method.</p><h2>Results</h2><p>The difference was not statistically significant (p = 0.12). We therefore conclude that the two methods are equivalent.</p><h2>Discussion</h2><p>These findings demonstrate that both methods work equally well for all university students.</p>',
  warnings: [], assets: [],
};
export const exampleReview = {
  summary: '## Peer Review Summary\n\nThis illustrative example shows how a review links feedback to specific passages. The main issues are selection into study groups, interpreting a nonsignificant result as equivalence, and generalizing beyond the sample [1–3].',
  coverage: { technical: 'complete', editorial: 'complete', references: 'skipped' },
  limitations: ['This is a short, synthetic example demonstrating the output format. No bibliography was provided.'],
  comments: [
    { text_snippet: 'Participants selected their preferred study method.', content: 'Self-selection can create differences between groups before the intervention. Describe relevant baseline characteristics and discuss how selection affects the interpretation of the comparison.', severity: 'major', reviewer: 'Technical Reviewer' },
    { text_snippet: 'We therefore conclude that the two methods are equivalent.', content: 'A nonsignificant difference does not establish equivalence. Report the estimated difference and uncertainty. If equivalence is the research question, justify an equivalence margin and use an appropriate equivalence test.', severity: 'major', reviewer: 'Technical Reviewer' },
    { text_snippet: 'for all university students', content: 'The sample comes from volunteers at one university. Limit the conclusion to the population supported by the sampling design and discuss external validity.', severity: 'minor', reviewer: 'Editorial Reviewer' },
  ],
};
