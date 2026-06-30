'use client';

import { useEffect, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  Container,
  Group,
  Modal,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';

interface PingRecord {
  status: 'up' | 'down';
  latencyMs: number | null;
  pingedAt: number;
}

interface TargetStatus {
  id: number;
  name: string;
  url: string;
  currentStatus: 'up' | 'down' | null;
  latencyMs: number | null;
  uptimePercent: number | null;
  recentPings: PingRecord[];
}

interface StatusData {
  targets: TargetStatus[];
}

export default function Dashboard() {
  const [data, setData] = useState<StatusData>({ targets: [] });
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [opened, { open, close }] = useDisclosure(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const load = () =>
      fetch('/api/status')
        .then((r) => r.json())
        .then((d: StatusData) => {
          setData(d);
          setLastUpdated(new Date().toLocaleTimeString());
        })
        .catch(console.error);

    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

  async function handleAdd() {
    if (!name.trim() || !url.trim()) return;
    setAdding(true);
    try {
      const res = await fetch('/api/targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), url: url.trim() }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setName('');
      setUrl('');
      close();
    } catch (err) {
      console.error('Failed to add target:', err);
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      const res = await fetch(`/api/targets/${id}`, { method: 'DELETE' });
      if (res.ok) setData((d) => ({ targets: d.targets.filter((t) => t.id !== id) }));
    } catch (err) {
      console.error('Failed to delete target:', err);
    }
  }

  return (
    <Container size="xl" py="md">
      {/* Header */}
      <Group justify="space-between" mb="xl">
        <Group>
          <Text c="green" fw={700} size="xl">▮</Text>
          <Title order={1} c="green" size="h3" style={{ letterSpacing: 2 }}>
            HOMELAB STATUS MONITOR
          </Title>
        </Group>
        <Group>
          {lastUpdated && (
            <Text size="xs" c="dimmed">LAST SYNC: {lastUpdated}</Text>
          )}
          <Button onClick={open} variant="outline" color="green" size="xs">
            + ADD TARGET
          </Button>
        </Group>
      </Group>

      {/* Target cards */}
      {data.targets.length === 0 ? (
        <Text c="dimmed" ta="center" mt="xl">
          NO TARGETS. CLICK &quot;+ ADD TARGET&quot; TO BEGIN MONITORING.
        </Text>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
          {data.targets.map((target) => (
            <TargetCard key={target.id} target={target} onDelete={handleDelete} />
          ))}
        </SimpleGrid>
      )}

      {/* Add target modal */}
      <Modal
        opened={opened}
        onClose={close}
        title="ADD MONITORING TARGET"
        centered
        styles={{
          title: { fontFamily: 'monospace', color: 'var(--mantine-color-green-6)', fontWeight: 700 },
          content: { backgroundColor: '#111', border: '1px solid #333' },
          header: { backgroundColor: '#111' },
        }}
      >
        <Stack>
          <TextInput
            label="Name"
            placeholder="Home Router"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <TextInput
            label="URL"
            placeholder="http://192.168.1.1:80"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <Button onClick={handleAdd} color="green" loading={adding}>
            ADD
          </Button>
        </Stack>
      </Modal>
    </Container>
  );
}

function TargetCard({
  target,
  onDelete,
}: {
  target: TargetStatus;
  onDelete: (id: number) => void;
}) {
  const isUp = target.currentStatus === 'up';
  const isDown = target.currentStatus === 'down';
  const borderColor = isUp ? '#39ff14' : isDown ? '#ff4444' : '#444';

  // Reverse for chronological display (oldest left → newest right)
  const chronological = [...target.recentPings].reverse();

  return (
    <Card
      withBorder
      p="md"
      style={{ borderColor, backgroundColor: '#0f0f0f' }}
    >
      {/* Title row */}
      <Group justify="space-between" mb={4}>
        <Text fw={700} c="white" size="sm" style={{ letterSpacing: 1 }}>
          {target.name}
        </Text>
        <Group gap={6}>
          {target.currentStatus ? (
            <Badge
              color={isUp ? 'green' : 'red'}
              variant="filled"
              size="sm"
              style={{ letterSpacing: 1 }}
            >
              {target.currentStatus.toUpperCase()}
            </Badge>
          ) : (
            <Badge color="gray" variant="outline" size="sm">PENDING</Badge>
          )}
          <ActionIcon
            variant="subtle"
            color="red"
            size="sm"
            onClick={() => onDelete(target.id)}
            title="Remove target"
          >
            ✕
          </ActionIcon>
        </Group>
      </Group>

      {/* URL */}
      <Text size="xs" c="dimmed" mb="xs" style={{ wordBreak: 'break-all' }}>
        {target.url}
      </Text>

      {/* Stats */}
      <Group mb="xs" gap="lg">
        <Text size="sm" c={isUp ? 'green' : 'dimmed'} fw={600}>
          {target.latencyMs !== null ? `${target.latencyMs}ms` : '--'}
        </Text>
        {target.uptimePercent !== null && (
          <Text size="sm" c="dimmed">
            {target.uptimePercent}% UP
          </Text>
        )}
      </Group>

      {/* Ping history strip */}
      <Group gap={3} wrap="nowrap">
        {chronological.length === 0 ? (
          <Text size="xs" c="dimmed">WAITING FOR FIRST PING...</Text>
        ) : (
          chronological.map((ping, i) => (
            <Tooltip
              key={i}
              label={`${ping.status.toUpperCase()} ${ping.latencyMs !== null ? `${ping.latencyMs}ms` : ''} @ ${new Date(ping.pingedAt).toLocaleTimeString()}`}
              position="top"
              withArrow
            >
              <Box
                style={{
                  width: 10,
                  height: 20,
                  backgroundColor: ping.status === 'up' ? '#39ff14' : '#ff4444',
                  borderRadius: 2,
                  flexShrink: 0,
                  cursor: 'default',
                }}
              />
            </Tooltip>
          ))
        )}
      </Group>
    </Card>
  );
}
