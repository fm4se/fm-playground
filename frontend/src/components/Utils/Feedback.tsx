import React, { useState } from 'react';
import { MDBBtn } from 'mdb-react-ui-kit';
import { saveFeedback } from '../../api/playgroundApi';
import '../../assets/style/Feedback.css';

const Feedback: React.FC<{ toggleFeedback: () => void }> = ({ toggleFeedback }) => {
  const [rating, setRating] = useState<number>(0);
  const [comment, setComment] = useState<string>('');
  const [submitted, setSubmitted] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleStarClick = (star: number): void => {
    setRating(star);
  };

  const handleCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
    setComment(e.target.value);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    try {
      await saveFeedback(rating, comment);
      setSubmitted(true);
      setRating(0);
      setComment('');
      toggleFeedback();
    } catch (err) {
      setError('There was an error submitting your feedback. Please try again.');
    }
  };


  return (
    <div className="feedback-container">
      <span className="close-icon" onClick={toggleFeedback}>&times;</span>
      <h4>Feedback</h4>
      <p>Please leave general feedback (this is anonymous and not linked to your specifications). If you think you have found a bug or problem, please <a href='https://github.com/se-buw/fm-playground/issues' target='_blank'>create an issue on GitHub</a> instead.</p>
      <div className="star-rating">
        {[1, 2, 3, 4, 5].map((star) => (
          <span
            key={star}
            className={`star ${rating >= star ? 'filled' : ''}`}
            onClick={() => handleStarClick(star)}
          >
            ★
          </span>
        ))}
      </div>
      <form onSubmit={handleSubmit}>
        <textarea
          value={comment}
          onChange={handleCommentChange}
          placeholder="Enter your comment here..."
          required
        />
        <MDBBtn rounded color='success' type="submit">Submit Now</MDBBtn>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
  );
};

export default Feedback;
