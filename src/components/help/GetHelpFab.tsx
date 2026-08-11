import { useNavigate } from 'react-router-dom'

export default function GetHelpFab() {
  const navigate = useNavigate()
  return (
    <button
      type="button"
      className="ht-fab"
      onClick={() => navigate('/help/tickets')}
      title="Get Help — raise or view support tickets"
    >
      Get Help
    </button>
  )
}
