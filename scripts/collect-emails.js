#!/usr/bin/env node
/**
 * Collect and manage subscriber emails
 * Usage: node collect-emails.js [command]
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(process.cwd(), 'data');
const SUBSCRIBERS_FILE = path.join(DATA_DIR, 'subscribers.json');

// Load subscribers
function loadSubscribers() {
  try {
    if (fs.existsSync(SUBSCRIBERS_FILE)) {
      return JSON.parse(fs.readFileSync(SUBSCRIBERS_FILE, 'utf8'));
    }
  } catch (error) {
    console.error('Error loading subscribers:', error.message);
  }
  return {};
}

// Export to CSV
function exportToCSV(subscribers) {
  const emails = Object.keys(subscribers);
  if (emails.length === 0) {
    console.log('No subscribers to export.');
    return;
  }

  let csv = 'Email,Name,Roadmaps,Subscribed Date\n';
  
  emails.forEach(email => {
    const s = subscribers[email];
    const name = s.name || '';
    const roadmaps = s.roadmaps ? s.roadmaps.join(';') : '';
    const date = s.subscribedAt ? new Date(s.subscribedAt).toISOString() : '';
    csv += `"${email}","${name}","${roadmaps}","${date}"\n`;
  });

  const exportFile = path.join(DATA_DIR, 'subscribers-export.csv');
  fs.writeFileSync(exportFile, csv);
  console.log(`✓ Exported to: ${exportFile}`);
}

// Export to text file (just emails)
function exportEmailsOnly(subscribers) {
  const emails = Object.keys(subscribers);
  if (emails.length === 0) {
    console.log('No emails to export.');
    return;
  }

  const emailList = emails.join('\n');
  const exportFile = path.join(DATA_DIR, 'emails-only.txt');
  fs.writeFileSync(exportFile, emailList);
  console.log(`✓ Exported ${emails.length} emails to: ${exportFile}`);
}

// Show statistics
function showStats(subscribers) {
  const emails = Object.keys(subscribers);
  console.log('\n📊 SUBSCRIBER STATISTICS');
  console.log('========================');
  console.log(`Total Subscribers: ${emails.length}`);
  
  if (emails.length === 0) {
    return;
  }

  // Count by roadmap
  const roadmapCounts = {};
  emails.forEach(email => {
    const s = subscribers[email];
    if (s.roadmaps) {
      s.roadmaps.forEach(r => {
        roadmapCounts[r] = (roadmapCounts[r] || 0) + 1;
      });
    }
  });

  console.log('\nBy Roadmap:');
  Object.entries(roadmapCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([roadmap, count]) => {
      console.log(`  ${roadmap}: ${count}`);
    });

  // Recent subscribers
  console.log('\nRecent Subscribers (last 10):');
  const sorted = emails
    .map(email => ({ email, ...subscribers[email] }))
    .sort((a, b) => new Date(b.subscribedAt || 0) - new Date(a.subscribedAt || 0))
    .slice(0, 10);
  
  sorted.forEach((s, i) => {
    const date = s.subscribedAt ? new Date(s.subscribedAt).toLocaleDateString() : 'N/A';
    const roadmaps = s.roadmaps ? s.roadmaps.join(', ') : 'none';
    console.log(`  ${i + 1}. ${s.email} (${s.name || 'no name'}) - ${roadmaps} - ${date}`);
  });
}

// List all subscribers
function listAll(subscribers) {
  const emails = Object.keys(subscribers);
  
  console.log('\n📧 ALL SUBSCRIBERS');
  console.log('==================');
  console.log(`Total: ${emails.length}\n`);
  
  if (emails.length === 0) {
    console.log('No subscribers yet.');
    return;
  }

  emails.forEach((email, i) => {
    const s = subscribers[email];
    const name = s.name || '(no name)';
    const roadmaps = s.roadmaps ? s.roadmaps.join(', ') : 'none';
    const date = s.subscribedAt ? new Date(s.subscribedAt).toLocaleDateString() : 'N/A';
    
    console.log(`${i + 1}. ${email}`);
    console.log(`   Name: ${name}`);
    console.log(`   Roadmaps: ${roadmaps}`);
    console.log(`   Date: ${date}`);
    console.log('');
  });
}

// Get emails array for sending
function getEmailsArray(subscribers) {
  return Object.keys(subscribers);
}

// Main
function main() {
  const command = process.argv[2] || 'list';
  const subscribers = loadSubscribers();

  switch (command) {
    case 'list':
      listAll(subscribers);
      break;
    
    case 'stats':
      showStats(subscribers);
      break;
    
    case 'export-csv':
      exportToCSV(subscribers);
      break;
    
    case 'export-emails':
      exportEmailsOnly(subscribers);
      break;
    
    case 'count':
      console.log(Object.keys(subscribers).length);
      break;
    
    case 'json':
      console.log(JSON.stringify(subscribers, null, 2));
      break;
    
    default:
      console.log(`
📧 Nigents Email Collector

Usage:
  node collect-emails.js [command]

Commands:
  list           Show all subscribers with details
  stats          Show statistics and recent subscribers
  export-csv     Export to CSV file
  export-emails  Export emails only (one per line)
  count          Show total count only
  json           Output raw JSON

Examples:
  node collect-emails.js list
  node collect-emails.js export-csv
  node collect-emails.js stats
`);
  }
}

main();
