import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Button, Alert } from 'react-native';
import { CameraView, Camera } from 'expo-camera';
import { useLatticeStore, ConnectionInfo } from '../store/useLatticeStore';
import { socketClient } from '../services/SocketClient';

export default function Scanner() {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    const getCameraPermissions = async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    };
    getCameraPermissions();
  }, []);

  const handleBarCodeScanned = ({ type, data }: { type: string; data: string }) => {
    setScanned(true);
    
    try {
      const parsed = JSON.parse(data);
      if (parsed.ip && parsed.port && parsed.token) {
        const info: ConnectionInfo = {
          ip: parsed.ip,
          port: Number(parsed.port),
          token: parsed.token
        };
        
        useLatticeStore.getState().setConnectionInfo(info);
        socketClient.connect(info);
      } else {
        throw new Error('Missing required connection fields');
      }
    } catch (err) {
      console.warn('Invalid QR code scanned:', data);
      Alert.alert(
        "Invalid QR Code", 
        "This QR code doesn't contain a valid Lattice connection payload.",
        [{ text: "Try Again", onPress: () => setScanned(false) }]
      );
    }
  };

  if (hasPermission === null) {
    return <View style={styles.container}><Text>Requesting for camera permission...</Text></View>;
  }
  if (hasPermission === false) {
    return <View style={styles.container}><Text>No access to camera</Text></View>;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Scan Lattice Desktop QR</Text>
      <View style={styles.scannerContainer}>
        <CameraView
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
          barcodeScannerSettings={{
            barcodeTypes: ["qr"],
          }}
          style={StyleSheet.absoluteFill}
        />
      </View>
      {scanned && (
        <Button title={'Tap to Scan Again'} onPress={() => setScanned(false)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f172a', // Slate 900
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#f8fafc', // Slate 50
    marginBottom: 20,
  },
  scannerContainer: {
    width: 300,
    height: 300,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#3b82f6', // Blue 500
    marginBottom: 20,
  }
});
