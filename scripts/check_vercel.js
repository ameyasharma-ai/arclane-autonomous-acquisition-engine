import 'dotenv/config';

async function checkDeployments() {
    const token = process.env.VERCEL_TOKEN;
    const projectId = 'prj_bDQewUJReqeKlYBNwvDPcO6vamOZ';
    const teamId = 'team_7pHeotFcK2tW9w7oom9czThz';
    const res = await fetch(`https://api.vercel.com/v6/deployments?projectId=${projectId}&teamId=${teamId}&limit=5`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    console.log(data.deployments.map(d => ({
        id: d.uid,
        name: d.name,
        state: d.state || d.readyState,
        created: new Date(d.createdAt).toLocaleTimeString(),
        commit: d.meta?.githubCommitSha?.slice(0, 7),
        commitMessage: d.meta?.githubCommitMessage
    })));
}

checkDeployments().catch(console.error);
