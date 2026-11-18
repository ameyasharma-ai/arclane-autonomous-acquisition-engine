import fs from 'fs';

const data = JSON.parse(fs.readFileSync('reports/.crm_state/full_sheet_dump.json', 'utf8'));

console.log('Total leads:', data.length);

console.log('\n--- First 20 Leads ---');
data.slice(0, 20).forEach(d => {
    console.log(`Row ${d.rowIndex} [ID ${d['Client ID']}]: Name="${d['Business Name']}", Rating="${d['Ratings']}", Reviews="${d['Number Of Reviews']}", Priority="${d['Priority Level']}", Status="${d['Current Status']}", Niche="${d['Industry/Niche']}"`);
});

console.log('\n--- Middle sample (Rows 100-110) ---');
data.slice(100, 110).forEach(d => {
    console.log(`Row ${d.rowIndex} [ID ${d['Client ID']}]: Name="${d['Business Name']}", Rating="${d['Ratings']}", Reviews="${d['Number Of Reviews']}", Priority="${d['Priority Level']}", Status="${d['Current Status']}"`);
});

console.log('\n--- Rows 480 to 505 ---');
data.slice(480).forEach(d => {
    console.log(`Row ${d.rowIndex} [ID ${d['Client ID']}]: Name="${d['Business Name']}", Rating="${d['Ratings']}", Reviews="${d['Number Of Reviews']}", Priority="${d['Priority Level']}", Status="${d['Current Status']}"`);
});
