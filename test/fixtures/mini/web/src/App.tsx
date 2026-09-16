import { Live } from './pages/Live';
import { Mocked } from './pages/Mocked';
export function App() {
  return (
    <Routes>
      <Route path="/live" element={<Live />} />
      <Route path="/mocked" element={adminGuard(<Mocked />)} />
      <Route path="*" element={<p>none</p>} />
    </Routes>
  );
}
