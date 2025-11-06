import { MockScenarios } from './src/__tests__/mock-llm-provider.ts';

const provider = MockScenarios.simpleConversation();

// Check if rules were added
console.log('Rules count:', provider.rules?.length || 'NO ACCESS TO RULES');

// Try to send a message
const testMessage = [{
  role: 'user',
  content: 'hello'
}];

provider.sendMessage(testMessage, []).then(response => {
  console.log('Response:', response);
}).catch(err => {
  console.error('Error:', err.message);
});
