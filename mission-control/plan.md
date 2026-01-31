## Overview: Single Concept, Many Tracks

Build a **“Winter Biathlon Robot Coach + Mission Control”**:  
- On‑board Arduino runs all sensing, path following, and actuation to complete the UTRA track. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/28596158/ed0bd273-08b4-4cee-906f-dcd35b1a1024/Copy-of-Hacker-Package-1.pdf)
- A laptop/tablet app (your “coach”) connects over USB to the Arduino between runs or at reupload points, pulls logs, runs AI/cloud analysis, then auto‑generates new Arduino parameters/code that you flash before the next attempt. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/28596158/ed0bd273-08b4-4cee-906f-dcd35b1a1024/Copy-of-Hacker-Package-1.pdf)
- This same app integrates Gemini, Solana, DigitalOcean, ElevenLabs, Snowflake, and MongoDB in clear, isolated modules so you can submit to all MLH categories simultaneously. 

You’re not streaming live teleop; you’re doing **“between‑laps pit‑stop intelligence”**, which respects the no‑wireless rule.

***

## Core Robot + Local App (Base for All Tracks)

Robot features (using only kit parts): [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/28596158/ed0bd273-08b4-4cee-906f-dcd35b1a1024/Copy-of-Hacker-Package-1.pdf)
- **Perception**:  
  - IR sensors for line following and path split detection (black vs colored paths).  
  - Color sensor for ring detection on the target (blue/red/green/black).  
  - Ultrasonic sensor for obstacle distance on the red path.  
- **Reasoning**:  
  - Finite state machine on Arduino for: start → pick up box → choose path → ramp logic → target navigation / obstacle navigation → shooting → return. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/28596158/ed0bd273-08b4-4cee-906f-dcd35b1a1024/Copy-of-Hacker-Package-1.pdf)
  - Tunable parameters: line‑follow gains, ramp speed, braking distance, obstacle avoidance thresholds, servo angles for launcher.  
- **Actuation**:  
  - DC motors for drive and ramps.  
  - Servo‑based claw/arm for box/battery pickup and drop.  
  - Servo‑powered spring or lever catapult for ball shooting at the target. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/28596158/ed0bd273-08b4-4cee-906f-dcd35b1a1024/Copy-of-Hacker-Package-1.pdf)

Laptop “Mission Control” app (Python or Node/TS):  
- Connects via USB serial to Arduino.  
- Can:  
  - Start a “run log” (timestamps, sensor values, states, errors).  
  - After the run, download summary stats: ramp success, obstacle touches, how many resets, approximate time, how far ball went (you can enter scoring zone manually after judging). [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/28596158/ed0bd273-08b4-4cee-906f-dcd35b1a1024/Copy-of-Hacker-Package-1.pdf)
  - Let you tweak configuration sliders (PID gains, speeds, servo angles) and push updated constants / regenerated code back to Arduino between attempts.

This base layer is what you present for **track score, technicality, build quality, and presentation**. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/28596158/ed0bd273-08b4-4cee-906f-dcd35b1a1024/Copy-of-Hacker-Package-1.pdf)

***

## Gemini: AI Coach & Strategy Assistant

Goal: “Best Use of Gemini API”. 

Gemini‑powered modules in the Mission Control app:  
1. **Auto‑tuning recommendations**  
   - Input: recent run logs (JSON), human‑entered scores (rings reached, obstacle penalties, time). [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/28596158/ed0bd273-08b4-4cee-906f-dcd35b1a1024/Copy-of-Hacker-Package-1.pdf)
   - Gemini suggests tuning changes in natural language: “Increase ramp speed by 10%, lower obstacle sensitivity on red path,” and outputs updated parameter JSON.   
   - App lets you “Apply” and pushes parameters to Arduino.

2. **Explainer and presentation helper**  
   - Feed Gemini a high‑level description of your system + run logs.  
   - It drafts a concise explanation of your perception / reasoning / actuation pipeline, which you refine into slides.  
   - During Q&A, you can show a “Robot Run Report” page summarizing what went wrong/right generated via Gemini.

3. **What‑if simulator (text‑based)**  
   - You describe hypothetical changes (“What if we choose red path first and skip target?”) and Gemini summarizes expected scoring tradeoffs using the rubric text you load into it. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/28596158/ed0bd273-08b4-4cee-906f-dcd35b1a1024/Copy-of-Hacker-Package-1.pdf)

Emphasize in your devpost description: Gemini is used as a **strategy coach and tuning assistant**, not just a generic chatbot.

***

## Solana: On‑Chain “Race Ledger” for Runs

Goal: “Best Use of Solana”. 

Idea: Every robot run becomes a “biathlon attempt” recorded on Solana as a small, structured transaction:  
- Fields: team ID, timestamp, path order (green vs red first), section scores, resets, reuploads, total track score, components actually used (for resourcefulness), plus a short hash of your run log. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/28596158/ed0bd273-08b4-4cee-906f-dcd35b1a1024/Copy-of-Hacker-Package-1.pdf)
- Your Mission Control app:  
  - After each run, shows a summary and “Publish to Solana” button.  
  - Uses a lightweight Solana client to send a transaction or update a simple on‑chain program. 

You can then:  
- Show a leaderboard page that reads Solana data and plots:  
  - Highest track score.  
  - Fewest components used vs score.  
  - Best obstacle time. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/28596158/ed0bd273-08b4-4cee-906f-dcd35b1a1024/Copy-of-Hacker-Package-1.pdf)
- Pitch this as a reusable “robot competition integrity ledger” framework for any future robotics contest, not just UTRA Hacks.

This makes Solana clearly integral, not bolted on.

***

## DigitalOcean: Cloud Backend & Deployment

Goal: “Best Use of DigitalOcean”. 

Use DigitalOcean for everything that needs persistent, always‑online infrastructure:   
- A small **web dashboard** deployed on App Platform:  
  - Shows live leaderboard (reading from Solana and MongoDB).  
  - Provides a REST API your laptop app uses to sync runs when you have internet.  
- A **Droplet** or App Platform service that hosts:  
  - A simple API for logging each run (redundant to Solana but easier to query).  
  - A small service that aggregates statistics, e.g., average speed on obstacle course, typical penalty patterns, suggested “safe” speed ranges.  
- Optionally, run a container that periodically calls Gemini (through your backend) to generate “event summary” narratives (“Your robot is strongest on target shooting; focus next on ramp transitions.”).

In judging, stress that DigitalOcean is the backbone: persistence, APIs, dashboards, and integration with other MLH services. 

***

## ElevenLabs: Narrated Biathlon Commentator

Goal: “Best Use of ElevenLabs”. 

Turn your robot runs into a mini Winter Olympics broadcast:  
- After each run, your laptop app sends a compact textual summary (generated by Gemini or your own template) to your backend.  
- Backend calls ElevenLabs to synthesize an energetic commentator track describing the run:  
  - “Team Alpha starts on the green path, nails the curved ramp, reaches the center, and launches the ball into the blue zone!” [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/28596158/ed0bd273-08b4-4cee-906f-dcd35b1a1024/Copy-of-Hacker-Package-1.pdf)
- The app can:  
  - Play the commentary with a simple animation or plotted path.  
  - Let you re‑play the “broadcast” while your robot is idle, enhancing presentation.

In the presentation, you can start with a 20‑second narrated highlight reel: visually very compelling and obviously using ElevenLabs.

***

## Snowflake: Analytics on Competition Data

Goal: “Best Use of Snowflake API”. 

Treat Snowflake as your competition analytics warehouse:  
- From your DigitalOcean backend, periodically ship run aggregates to Snowflake:  
  - Feature vector per run: ramp choice, order of sections, time, penalties, ball scoring zone, reuploads, resets, config parameters. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/28596158/ed0bd273-08b4-4cee-906f-dcd35b1a1024/Copy-of-Hacker-Package-1.pdf)
- Use Snowflake’s REST API:  
  - Run queries like: “Which configuration ranges correlate with hitting blue ring vs red?” or “Does doing obstacle course first improve overall score?”   
  - Provide a simple dashboard in your web app that displays query results for your team.  
- For the demo, pre‑populate a few runs (your own) to show that you can ask Snowflake for strategic questions and then feed those insights back into Gemini’s tuning suggestions.

You frame this as an **“AI + analytics feedback loop”** for robotics competitions.

***

## MongoDB Atlas: Robot Run & Config Database

Goal: “Best Use of MongoDB Atlas”. 

Use MongoDB Atlas as the main database for your tooling:  
- Collections:  
  - `teams` (team name, members, optional future reuse)  
  - `runs` (raw logs, summary metrics, derived analytics, commentary URL from ElevenLabs, on‑chain tx id from Solana)  
  - `configs` (parameter sets pushed to Arduino, with versions and labels like “Aggressive target shooting v3”)  
- When you click “Start run” in your Mission Control app:  
  - It creates a new document in `runs` with config version, then appends data as the run finishes.  
- When you click “Apply Gemini suggestion”:  
  - Store the new config as a new document in `configs` and link it to future runs.

Clearly articulate to judges: MongoDB stores **all robot telemetry and configurations**, enabling experimentation and reproducibility beyond the weekend. 

***

## How This Wins MLH Tracks

| Track | How you satisfy it |
| --- | --- |
| Gemini | AI coach that tunes robot parameters, explains performance, drafts presentation, and simulates scoring tradeoffs.  [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/28596158/ed0bd273-08b4-4cee-906f-dcd35b1a1024/Copy-of-Hacker-Package-1.pdf) |
| Solana | On‑chain ledger of all robot runs + public leaderboard interface.  |
| DigitalOcean | Hosts APIs, dashboards, and integration services tying everything together.  |
| ElevenLabs | Generates commentator audio for each run, used in a “broadcast” style demo.  |
| Snowflake API | Stores and analyzes run aggregates for performance insights and strategy.  |
| MongoDB Atlas | Primary database for runs, configs, and commentary metadata.  |

All of this is **adjacent** to the robot but meaningfully connected: the robot is still the star, the cloud/AI stack is its Winter Olympics “coaching and analytics suite.”

***

## Staying Within Constraints

- No extra hardware beyond the kit: all external services run on your laptop/servers; robot only connects via USB to your computer (allowed for programming). [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/28596158/ed0bd273-08b4-4cee-906f-dcd35b1a1024/Copy-of-Hacker-Package-1.pdf)
- No Bluetooth/Wi‑Fi modules on the robot; the intelligence loop is “run → log → dock → analyze → reflash → run again.”  
- For the actual 5‑minute judged run, you pre‑load the best config that your AI + analytics stack helped you discover. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/28596158/ed0bd273-08b4-4cee-906f-dcd35b1a1024/Copy-of-Hacker-Package-1.pdf)

***

If you want, I can next:  
- Sketch a concrete architecture diagram (in text) showing data flows.  
- Propose a minimal MVP version you can realistically implement in a weekend for at least 3–4 of the MLH tracks.