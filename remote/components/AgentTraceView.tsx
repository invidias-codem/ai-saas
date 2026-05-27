import React, { useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView, ActivityIndicator } from 'react-native';
import { useLatticeStore, TraceBlock } from '../store/useLatticeStore';
import { socketClient } from '../services/SocketClient';

export default function AgentTraceView() {
  const { status, traceBlocks, errorMessage, connectionInfo } = useLatticeStore();
  const flatListRef = useRef<FlatList>(null);

  const handleHalt = () => {
    socketClient.haltExecution();
  };

  const renderTraceBlock = ({ item }: { item: TraceBlock }) => {
    return (
      <View style={styles.traceBlock}>
        <View style={styles.traceHeader}>
          <Text style={styles.traceType}>{item.type || 'SYSTEM'}</Text>
          <Text style={styles.traceTime}>
            {new Date(item.timestamp).toLocaleTimeString()}
          </Text>
        </View>
        <Text style={styles.traceContent}>{item.content}</Text>
      </View>
    );
  };

  const renderHeader = () => {
    let statusColor = '#94a3b8'; // Slate 400 (idle)
    let statusText = 'Disconnected';

    if (status === 'connected') {
      statusColor = '#22c55e'; // Green 500
      statusText = `Connected to ${connectionInfo?.ip}`;
    } else if (status === 'connecting') {
      statusColor = '#eab308'; // Yellow 500
      statusText = 'Connecting...';
    } else if (status === 'error') {
      statusColor = '#ef4444'; // Red 500
      statusText = errorMessage || 'Connection Error';
    }

    return (
      <View style={styles.header}>
        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        <Text style={styles.headerText}>{statusText}</Text>
        {status === 'connecting' && <ActivityIndicator size="small" color="#eab308" style={{ marginLeft: 8 }} />}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {renderHeader()}
      
      <FlatList
        ref={flatListRef}
        data={traceBlocks}
        renderItem={renderTraceBlock}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        initialNumToRender={15}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={true}
        onContentSizeChange={() => {
          if (traceBlocks.length > 0) {
            flatListRef.current?.scrollToEnd({ animated: true });
          }
        }}
      />

      <View style={styles.footer}>
        <TouchableOpacity style={styles.haltButton} onPress={handleHalt} activeOpacity={0.8}>
          <Text style={styles.haltButtonText}>Halt Execution</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a', // Slate 900
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b', // Slate 800
    backgroundColor: '#0f172a',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  headerText: {
    color: '#f8fafc', // Slate 50
    fontSize: 16,
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
    paddingBottom: 20,
  },
  traceBlock: {
    backgroundColor: '#1e293b', // Slate 800
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#3b82f6', // Blue 500
  },
  traceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  traceType: {
    color: '#93c5fd', // Blue 300
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  traceTime: {
    color: '#64748b', // Slate 500
    fontSize: 12,
  },
  traceContent: {
    color: '#f1f5f9', // Slate 100
    fontSize: 14,
    lineHeight: 20,
  },
  footer: {
    padding: 16,
    backgroundColor: '#0f172a',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  haltButton: {
    backgroundColor: '#ef4444', // Red 500
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  haltButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  }
});
