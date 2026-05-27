import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { useLatticeStore } from './store/useLatticeStore';
import Scanner from './components/Scanner';
import AgentTraceView from './components/AgentTraceView';

export default function App() {
  const status = useLatticeStore((state) => state.status);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      {status === 'idle' ? <Scanner /> : <AgentTraceView />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
});
