import fs from 'fs';

const data = JSON.parse(fs.readFileSync('reports/.crm_state/full_sheet_dump.json', 'utf8'));

console.log('--- Priority Level Distribution ---');
const priorities = {};
data.forEach(d => {
    const p = d['Priority Level'] || '(empty)';
    priorities[p] = (priorities[p] || 0) + 1;
});
console.log(priorities);

console.log('\n--- Checking rows sorted by reviews ---');
for (let i = 0; i < 30; i++) {
    const d = data[i];
    const revStr = (d['Number Of Reviews'] || '0').replace(/,/g, '');
    const rev = parseInt(revStr, 10) || 0;
    console.log(`Row ${d.rowIndex} [ID ${d['Client ID']}]: Reviews=${rev}, Rating="${d['Ratings']}", Priority="${d['Priority Level']}"`);
}

console.log('\n--- Checking where Priority changes ---');
let currentP = '';
for (let i = 0; i < 500; i++) {
    const d = data[i];
    const p = d['Priority Level'] || '';
    if (p !== currentP) {
        const revStr = (d['Number Of Reviews'] || '0').replace(/,/g, '');
        console.log(`Transition at Row ${d.rowIndex} [ID ${d['Client ID']}]: New Priority="${p}", Reviews=${revStr}`);
        currentP = p;
    }
}
