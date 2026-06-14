# London A2A & A2UI Hackathon Requirements

**Event:** Google London CSG, June 13, 2026  
**Track:** Generative UI (Track 2)  
**Project:** Rho Signal Room

## Required Technology Stack

### Core Components (Must Include)
- **CopilotKit** - Agent-to-frontend communication framework
- **AG-UI** - Agent UI primitives and components  
- **A2UI** - Agent-to-User Interface protocol v0.9
- **LinkUp** - External data source integration for evidence
- **Redis** - Session state and agent memory storage

### Technical Specifications
- **LLM:** Gemini 3.5 Flash (required for submissions)
- **Protocol:** A2UI v0.9 compliance mandatory
- **Frontend:** React-based with real-time UI generation
- **Backend:** Agent system with state-driven interface generation

## Submission Requirements

### Deliverables
1. **Public GitHub Repository**
   - Working demo application
   - Complete source code
   - Documentation and setup instructions

2. **Demo Video (2-3 minutes)**
   - Showcase core functionality
   - Demonstrate generative UI capabilities
   - Show integration of all required components

3. **Social Media Post**
   - Project overview
   - Key features highlighted
   - Technology stack mentioned

4. **Original Domain Implementation**
   - Banking/financial services focus
   - Real-world use case demonstration
   - Creative application of generative UI

## Judging Criteria

### Primary Evaluation Areas
1. **Creative Use of Generative UI + A2UI** (40%)
   - Innovative interface generation
   - Dynamic component composition
   - User experience quality

2. **Technical Integration** (30%)
   - All required stack components integrated
   - Proper A2UI protocol implementation
   - Stable, functional demo

3. **Technical Difficulty** (20%)
   - Complexity of implementation
   - Advanced features demonstrated
   - Problem-solving approach

4. **Originality** (10%)
   - Unique concept or approach
   - Novel use of technology
   - Domain innovation

## Technical Constraints

### Must-Have Features
- Real-time UI generation from agent state
- Component catalog extensibility
- Evidence-backed responses using LinkUp
- Redis-backed session state
- A2UI v0.9 envelope emission (`createSurface`, `updateComponents`, `updateDataModel`)

### Prohibited Changes
- No version bumps for pinned dependencies
- No alternative LLM models for submission
- No breaking A2UI protocol changes
- No removal of required stack components

## Mixed-Track Integration (Optional Extension)

For participants also working on Track 1 (A2A):
- Connect A2A banking agents to generative UI frontend
- Demonstrate multi-agent collaboration through generated interfaces
- Show agent handoffs and state transitions in UI
- Use Redis for cross-agent session state
- Visualize A2A protocol interactions

## Success Metrics

### Functional Requirements
- ✅ Demo runs locally without errors
- ✅ All required components integrated and functional
- ✅ A2UI surfaces generate dynamically
- ✅ LinkUp provides external evidence
- ✅ Redis stores session state
- ✅ User can complete end-to-end scenario

### Quality Requirements
- ✅ Clean, documented code
- ✅ Intuitive user interface
- ✅ Stable performance
- ✅ Error handling and edge cases
- ✅ Professional presentation

## Project Structure Compliance

```
src/
├── app/                    # Next.js frontend
├── a2ui/                   # A2UI component catalog
├── components/             # React components
└── hooks/                  # Custom hooks

agent/                      # Python LangGraph agents
├── src/                    # Agent implementation
└── main.py                 # FastAPI server

a2a/                        # Optional A2A integration
└── compliance/             # A2A protocol tools
```

## Validation Commands

```bash
# Environment check
pnpm run doctor

# Component validation
pnpm validate-widget <path>

# Full system test
pnpm smoke

# A2A compliance check
pnpm check-a2a <url>
```

## Submission Checklist

- [ ] Public GitHub repository created
- [ ] All required components integrated
- [ ] Demo video recorded (2-3 minutes)
- [ ] Social media post prepared
- [ ] Code documented and cleaned
- [ ] Environment variables configured
- [ ] Local testing completed
- [ ] `pnpm smoke` passes
- [ ] A2UI components validated
- [ ] LinkUp integration functional
- [ ] Redis session state working

## Additional Resources

- **A2A Protocol:** https://a2a-protocol.org/latest/specification/
- **CopilotKit Documentation:** Available in package docs
- **A2UI Specification:** v0.9 reference in repository
- **LinkUp Integration:** See a2a/ directory examples
- **Redis Configuration:** Docker compose setup included

---

*This document preserves the official hackathon requirements from the June 13, 2026 event briefing for future reference and development guidance.*
