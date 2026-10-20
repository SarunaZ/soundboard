package dev.sarunas.soundboard.capturefixture;

import android.app.Activity;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioTrack;
import android.os.Bundle;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

public final class MainActivity extends Activity {
    private static final int SAMPLE_RATE = 44100;
    private static final int FRAMES_PER_WRITE = 2048;
    private static final int[] POLICIES = {
            AudioAttributes.ALLOW_CAPTURE_BY_ALL,
            AudioAttributes.ALLOW_CAPTURE_BY_SYSTEM,
            AudioAttributes.ALLOW_CAPTURE_BY_NONE
    };
    private static final String[] POLICY_NAMES = {"ALL", "SYSTEM", "NONE"};

    private int selectedPolicyIndex = 0;
    private TextView policyLabel;
    private TextView statusLabel;
    private volatile boolean playing;
    private AudioTrack activeTrack;
    private Thread playbackThread;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setGravity(Gravity.CENTER_HORIZONTAL);
        layout.setPadding(24, 28, 24, 24);

        TextView title = new TextView(this);
        title.setText("Device audio capture fixture");
        title.setTextSize(24);
        title.setGravity(Gravity.CENTER);
        layout.addView(title, matchWidth());

        TextView description = new TextView(this);
        description.setText("Synthetic repeating 440 / 660 / 880 Hz tone pattern. Audio usage: MEDIA.");
        description.setTextSize(16);
        description.setGravity(Gravity.CENTER);
        description.setPadding(0, 20, 0, 12);
        layout.addView(description, matchWidth());

        policyLabel = new TextView(this);
        policyLabel.setTextSize(20);
        policyLabel.setGravity(Gravity.CENTER);
        layout.addView(policyLabel, matchWidth());
        addButton(layout, "Capture policy: ALL", () -> selectPolicy(0));
        addButton(layout, "Capture policy: SYSTEM", () -> selectPolicy(1));
        addButton(layout, "Capture policy: NONE", () -> selectPolicy(2));
        addButton(layout, "Start tone", this::startTone);
        addButton(layout, "Stop", this::stopTone);

        statusLabel = new TextView(this);
        statusLabel.setTextSize(16);
        statusLabel.setGravity(Gravity.CENTER);
        statusLabel.setPadding(0, 16, 0, 0);
        layout.addView(statusLabel, matchWidth());
        setContentView(layout);
        updateLabels();
    }

    private LinearLayout.LayoutParams matchWidth() {
        return new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT);
    }

    private void addButton(LinearLayout parent, String label, Runnable action) {
        Button button = new Button(this);
        button.setText(label);
        button.setOnClickListener(view -> action.run());
        parent.addView(button, matchWidth());
    }

    private void selectPolicy(int index) {
        if (selectedPolicyIndex == index) return;
        stopTone();
        selectedPolicyIndex = index;
        updateLabels();
        statusLabel.setText("Policy changed. Start a fresh player to apply it.");
    }

    private void updateLabels() {
        policyLabel.setText("Selected capture policy: " + POLICY_NAMES[selectedPolicyIndex]);
        statusLabel.setText(playing ? "Playing synthetic tone" : "Stopped");
    }

    private void startTone() {
        stopTone();
        int minBuffer = AudioTrack.getMinBufferSize(SAMPLE_RATE,
                AudioFormat.CHANNEL_OUT_STEREO, AudioFormat.ENCODING_PCM_16BIT);
        if (minBuffer <= 0) {
            statusLabel.setText("AudioTrack initialization failed: " + minBuffer);
            return;
        }

        AudioAttributes attributes = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .setAllowedCapturePolicy(POLICIES[selectedPolicyIndex])
                .build();
        AudioFormat format = new AudioFormat.Builder()
                .setSampleRate(SAMPLE_RATE)
                .setChannelMask(AudioFormat.CHANNEL_OUT_STEREO)
                .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                .build();
        try {
            activeTrack = new AudioTrack.Builder()
                    .setAudioAttributes(attributes)
                    .setAudioFormat(format)
                    .setTransferMode(AudioTrack.MODE_STREAM)
                    .setBufferSizeInBytes(Math.max(minBuffer, FRAMES_PER_WRITE * 4))
                    .build();
            if (activeTrack.getState() != AudioTrack.STATE_INITIALIZED) {
                stopTone();
                statusLabel.setText("AudioTrack did not initialize.");
                return;
            }
            AudioTrack track = activeTrack;
            playing = true;
            statusLabel.setText("Playing synthetic tone");
            track.play();
            playbackThread = new Thread(() -> writeToneForever(track), "fixture-tone");
            playbackThread.start();
        } catch (IllegalArgumentException | IllegalStateException error) {
            stopTone();
            statusLabel.setText("AudioTrack error: " + error.getClass().getSimpleName());
        }
    }

    private void writeToneForever(AudioTrack track) {
        short[] samples = new short[FRAMES_PER_WRITE * 2];
        long frame = 0;
        double[] frequencies = {440.0, 660.0, 880.0, 0.0};
        int[] segmentFrames = {SAMPLE_RATE * 3 / 5, SAMPLE_RATE * 3 / 5,
                SAMPLE_RATE * 3 / 5, SAMPLE_RATE / 5};
        int segment = 0;
        int frameInSegment = 0;
        while (playing && activeTrack == track) {
            for (int i = 0; i < FRAMES_PER_WRITE; i++) {
                double frequency = frequencies[segment];
                short sample = frequency == 0.0 ? 0 : (short) (Math.sin(
                        2.0 * Math.PI * frequency * frame / SAMPLE_RATE) * 9000.0);
                samples[i * 2] = sample;
                samples[i * 2 + 1] = sample;
                frame++;
                frameInSegment++;
                if (frameInSegment >= segmentFrames[segment]) {
                    frameInSegment = 0;
                    segment = (segment + 1) % frequencies.length;
                }
            }
            try {
                int written = track.write(samples, 0, samples.length, AudioTrack.WRITE_BLOCKING);
                if (written < 0) break;
            } catch (IllegalStateException released) {
                break;
            }
        }
    }

    private void stopTone() {
        playing = false;
        AudioTrack track = activeTrack;
        activeTrack = null;
        if (track != null) {
            try {
                track.pause();
                track.flush();
            } catch (IllegalStateException ignored) {
                // The track may already have been torn down by the audio server.
            }
            track.release();
        }
        Thread thread = playbackThread;
        playbackThread = null;
        if (thread != null && thread != Thread.currentThread()) thread.interrupt();
        if (statusLabel != null) statusLabel.setText("Stopped");
    }

    @Override
    protected void onDestroy() {
        stopTone();
        super.onDestroy();
    }
}
