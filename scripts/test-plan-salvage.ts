// Quick harness: simulate a plan truncated mid-string (the exact prod failure)
import { readFileSync } from 'fs';

const src = readFileSync('lib/ucol/prompts/geminiPlanner.ts', 'utf8');
// extract repairTruncatedJson via eval of transpiled fn — simpler: re-import module not possible (server deps). Use regex to grab the function body and eval as JS (it's dependency-free plain TS).
const m = src.match(/function repairTruncatedJson[\s\S]*?\n}\n/);
if (!m) throw new Error('fn not found');
const fnSrc = m[0].replace(/: string \| null/, '').replace(/: string\)/, ')').replace(/const stack: string\[\]/, 'const stack').replace(/const closeStack: string\[\]/, 'const closeStack').replace(/let inString = false;/, 'let inString = false;').replace(/(let \w+)(: \w+)/g, '$1');
// eslint-disable-next-line no-eval
const repairTruncatedJson = eval(`(${fnSrc})`);

const full = {
  appName: 'TaskFlow',
  description: 'A task manager',
  techStack: ['Next.js', 'TypeScript'],
  pages: [{ name: 'Home', route: '/', description: 'main', components: ['TaskList'] }],
  components: [
    { name: 'TaskItem', filePath: 'components/TaskItem.tsx', description: 'one task', props: ['task: Task'], dependencies: [], priority: 0 },
    { name: 'TaskList', filePath: 'components/TaskList.tsx', description: 'list of tasks', props: ['tasks: Task[]'], dependencies: ['TaskItem'], priority: 1 },
    { name: 'AddTaskForm', filePath: 'components/AddTaskForm.tsx', description: 'form to add', props: [], dependencies: [], priority: 0 },
  ],
  dataModel: [{ name: 'Task', fields: [{ name: 'id', type: 'string', description: 'uuid' }] }],
  apiRoutes: [],
  reasoning: 'Simple dependency graph with leaf components first',
};
const fullStr = JSON.stringify(full);

// Case 1: cut mid-string (unterminated string — matches prod error)
const cutMidString = fullStr.slice(0, fullStr.indexOf('form to add') + 5);
// Case 2: cut right after a comma
const cutAfterComma = fullStr.slice(0, fullStr.indexOf('"AddTaskForm"') - 9);
// Case 3: cut mid-key
const cutMidKey = fullStr.slice(0, fullStr.indexOf('"dataModel"') + 7);

for (const [label, txt] of [['mid-string', cutMidString], ['after-comma', cutAfterComma], ['mid-key', cutMidKey]] as const) {
  const repaired = repairTruncatedJson(txt);
  try {
    const parsed = JSON.parse(repaired);
    console.log(`${label}: OK — appName=${parsed.appName}, components=${(parsed.components || []).length}`);
  } catch (e: any) {
    console.log(`${label}: FAILED — ${e.message}`);
    console.log('  repaired tail:', (repaired || '').slice(-120));
  }
}
