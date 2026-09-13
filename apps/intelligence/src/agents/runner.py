from src.agents.state import AgentState
from src.domain.models import ChatMessage, MessageRole
from src.providers.gateway import gateway


class AgentRunner:
    """Executes multi-step agent reasoning loops."""

    async def run(self, state: AgentState) -> AgentState:
        while not state.is_finished and state.current_step < state.max_steps:
            state.current_step += 1
            state.actions_taken.append(f"step_{state.current_step}:reasoning")

            # Final step produces conclusion
            if state.current_step >= state.max_steps or len(state.messages) > 0:
                last_user_query = state.messages[-1].content
                reply_content = f"[Agent Output] Processed: '{last_user_query}' through {state.current_step} reasoning step(s)."

                state.messages.append(
                    ChatMessage(role=MessageRole.ASSISTANT, content=reply_content)
                )
                state.is_finished = True

        return state


agent_runner = AgentRunner()
